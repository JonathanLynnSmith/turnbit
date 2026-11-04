param([ValidateSet('spotify','default')][string]$Source = 'spotify')
$ErrorActionPreference = 'Stop'
try { [Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal' } catch { }
$audioLib = Join-Path $PSScriptRoot 'audio'
$core = Join-Path $audioLib 'NAudio.Core.dll'
$wasapi = Join-Path $audioLib 'NAudio.Wasapi.dll'
[void][Reflection.Assembly]::LoadFrom($core)
[void][Reflection.Assembly]::LoadFrom($wasapi)
Add-Type -ReferencedAssemblies @($core,$wasapi,'System.dll','System.Core.dll','System.Web.Extensions.dll','netstandard') -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.Threading;
using System.Web.Script.Serialization;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;
using NAudio.Wave;
using NAudio.Dsp;

public static class TurnbitLoopback {
    static readonly object output = new object();
    static volatile bool done, paused;
    static volatile bool restart;
    static int token;
    static WasapiLoopbackCapture capture;
    static MMDevice currentDevice;
    static string currentId;
    static string mode;
    static void Send(object value) {
        lock(output) { Console.WriteLine(new JavaScriptSerializer().Serialize(value)); Console.Out.Flush(); }
    }
    static string SelectDevice() {
        using(var devices = new MMDeviceEnumerator()) {
            string candidate=null;
            if(mode == "spotify") {
                var ids = new HashSet<uint>();
                foreach(var p in Process.GetProcessesByName("Spotify")) { using(p) { ids.Add((uint)p.Id); } }
                foreach(var device in devices.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active)) {
                    using(device) {
                        try {
                            var sessions = device.AudioSessionManager.Sessions;
                            for(int i=0; i<sessions.Count; i++) {
                                using(var session = sessions[i]) {
                                    if(ids.Contains(session.GetProcessID)) {
                                        if(session.State == AudioSessionState.AudioSessionStateActive) return device.ID;
                                        if(candidate==null) candidate=device.ID;
                                    }
                                }
                            }
                        } catch { }
                    }
                }
                if(candidate!=null) return candidate;
            }
            using(var device = devices.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia)) return device.ID;
        }
    }
    static void CloseCapture() {
        Interlocked.Increment(ref token);
        if(capture != null) { try { capture.StopRecording(); } catch {} capture.Dispose(); capture=null; }
        if(currentDevice != null) { currentDevice.Dispose(); currentDevice=null; }
        currentId=null;
    }
    sealed class Spectrum {
        readonly float[] samples = new float[2048];
        readonly Complex[] fft = new Complex[2048];
        readonly double[] window = new double[2048];
        readonly WaveFormat format;
        readonly bool floating;
        readonly Stopwatch clock = Stopwatch.StartNew();
        int position, count, since;
        public Spectrum(WaveFormat f) {
            format=f;
            var ext=f as WaveFormatExtensible;
            floating=f.Encoding == WaveFormatEncoding.IeeeFloat || (ext != null && ext.SubFormat == new Guid("00000003-0000-0010-8000-00aa00389b71"));
            for(int i=0;i<2048;i++) window[i]=0.5*(1-Math.Cos(2*Math.PI*i/2047));
        }
        float Sample(byte[] data,int index) {
            if(floating && format.BitsPerSample==32) return BitConverter.ToSingle(data,index);
            if(format.BitsPerSample==16) return BitConverter.ToInt16(data,index)/32768f;
            if(format.BitsPerSample==24) return ((data[index]<<8)|(data[index+1]<<16)|(data[index+2]<<24))/2147483648f;
            if(format.BitsPerSample==32) return BitConverter.ToInt32(data,index)/2147483648f;
            return 0;
        }
        double Band(int from,int to) {
            int first=Math.Max(1,(int)Math.Ceiling(from*2048.0/format.SampleRate));
            int last=Math.Min(1023,(int)Math.Floor(to*2048.0/format.SampleRate));
            double energy=0;
            for(int i=first;i<=last;i++) energy+=fft[i].X*fft[i].X+fft[i].Y*fft[i].Y;
            double rms=Math.Sqrt(energy)*2;
            return Math.Max(0,Math.Min(1,(20*Math.Log10(rms+1e-10)+85)/65));
        }
        public void Receive(byte[] data,int bytes) {
            if(paused) { count=since=0; return; }
            for(int index=0;index+format.BlockAlign<=bytes;index+=format.BlockAlign) {
                samples[position]=Sample(data,index);
                position=(position+1)%2048;count=Math.Min(2048,count+1);since++;
                if(count<2048 || since<1024 || clock.ElapsedMilliseconds<67) continue;
                since=0;clock.Restart();double rms=0;
                for(int i=0;i<2048;i++) {float value=samples[(position+i)%2048];rms+=value*value;fft[i].X=(float)(value*window[i]);fft[i].Y=0;}
                rms=Math.Sqrt(rms/2048);
                FastFourierTransform.FFT(true,11,fft);
                Send(new {type="bands",bands=new double[]{Band(40,250),Band(250,2000),Band(2000,10000)},rms=rms});
            }
        }
    }
    static void Watch() {
        while(!done) {
            try {
                string id=SelectDevice();
                if(restart || id!=currentId) {
                    CloseCapture(); restart=false;
                    using(var devices=new MMDeviceEnumerator()) currentDevice=devices.GetDevice(id);
                    var next=new WasapiLoopbackCapture(currentDevice);
                    var spectrum=new Spectrum(next.WaveFormat);
                    int mine=token;
                    next.DataAvailable+=(s,e)=>{if(mine==token && !done) spectrum.Receive(e.Buffer,e.BytesRecorded);};
                    next.RecordingStopped+=(s,e)=>{if(mine==token && !done) {restart=true;Send(new {type="reconnecting"});}};
                    capture=next; currentId=id;
                    capture.StartRecording();
                    Send(new {type="source",name=currentDevice.FriendlyName,mode=mode});
                }
            } catch(Exception e) {
                CloseCapture(); restart=true;
                Send(new {type="reconnecting",message=e.Message});
            }
            for(int i=0;i<20&&!done;i++) Thread.Sleep(100);
        }
        CloseCapture();
    }
    public static void Run(string source) {
        mode=source; done=false;paused=false;restart=false;
        var worker=new Thread(Watch);worker.IsBackground=true;worker.Start();
        string command;
        while((command=Console.ReadLine())!=null) {
            if(command=="stop") break;
            if(command=="pause") paused=true;
            if(command=="resume") paused=false;
        }
        done=true;worker.Join(4000);
    }
}
'@
[TurnbitLoopback]::Run($Source)

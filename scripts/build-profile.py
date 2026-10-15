"""Create a separate importable DialPod profile from Studio's bundled Dial template.

This reads the factory template only; it never edits active device profiles.
"""
import io
import json
import os
from pathlib import Path
import sys
import uuid
import zipfile

project = Path(__file__).resolve().parent.parent
template = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(os.environ['APPDATA']) / 'Ulanzi/UlanziDeck/defProfile/Dial/Default_Profile/Default Profile.ulanziDeckProfile'
with zipfile.ZipFile(template) as source:
    root_manifest = next(name for name in source.namelist() if name.endswith('/manifest.json') and name.count('/') == 1)
    config = json.loads(source.read(root_manifest))

profile_id, page_id = str(uuid.uuid4()), str(uuid.uuid4())
root = profile_id + '.ulanziProfile/'
config.update(Name='DialPod', Icon='icon.png', Pages={'Current': page_id, 'Pages': [page_id]})

def action(name, action_id):
    return {'Action': 'com.ulanzi.ulanzistudio.dialpod.' + action_id,
            'ActionID': str(uuid.uuid4()), 'ActionParam': {}, 'LinkedTitle': True,
            'Name': 'DialPod ' + name, 'State': 0,
            'ViewParam': [{'IconRel': '', 'Text': name}]}

# Positions follow the factory Dial profile: its three media keys use
# 0_0, 1_0, 2_0; the encoder uses 0_2. Side positions retain that schema.
page = {'Controllers': [
    {'Type': 'Encoder', 'Actions': {'0_2': action('Navigation Wheel', 'encoder')}},
    {'Type': 'Keypad', 'Actions': {
        '0_0': action('Previous', 'previous'),
        '1_0': action('Play / Pause', 'toggle'),
        '2_0': action('Next', 'next'),
        '0_1': action('Menu / Back', 'menu'),
        '2_1': action('Volume Up', 'volume-up'),
        '1_1': action('Volume Down', 'volume-down'),
        '1_2': action('Seek Back 10s', 'seek-back'),
    }},
], 'Icon': '', 'Name': 'DialPod'}

data = io.BytesIO()
with zipfile.ZipFile(data, 'w', zipfile.ZIP_DEFLATED) as output:
    output.writestr(root + 'manifest.json', json.dumps(config))
    output.writestr(root + f'Profiles/{page_id}/manifest.json', json.dumps(page))
    output.writestr(root + f'Profiles/{page_id}/Images/', '')
    output.writestr(root + f'Profiles/{page_id}/Files/', '')
    output.write(project / 'ulanzi-plugin/com.ulanzi.dialpod.ulanziPlugin/icon.png', root + 'icon.png')

destination = project / 'ulanzi-plugin/DialPod.ulanziDeckProfile'
destination.write_bytes(b'#Version: 2\n' + data.getvalue())
with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None
    saved = json.loads(archive.read(root + f'Profiles/{page_id}/manifest.json'))
    assert len(saved['Controllers'][1]['Actions']) == 7
print(f'Created importable profile: {destination}')

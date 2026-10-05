from pathlib import Path
import json, shutil
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT=Path(__file__).resolve().parents[1]
RAW=Path(r'C:\Users\KSD\.codex\generated_images\01a107fd-3093-7152-a92e-3594277bff67')
FILES=dict(mortar='44b7b462-fe07-4942-ac6b-0ee1e023187f',mole='cbbf5ce6-98e0-49a8-a1b0-1053b19c7013',hive='538349f8-fa66-4ff3-85db-2746ca6ac2f8',venom='cb7034cf-f973-4fa9-86f1-952e1115c552',glacier='a188d3d7-87b0-404d-b6dc-f3604f5b40e1',bolt='f5b2bed9-b242-4640-a2b1-589b7d0c54e5',ricochet='e5daeace-c7fc-4c43-a60e-3189c6126242',solar='e3e00f10-be47-4541-beb3-c0dcb901fb9d')
source=ROOT/'authoring/growth-sprites';source.mkdir(parents=True,exist_ok=True)
runtime=ROOT/'sprites/evolution'
js=ROOT/'src/evolution.js';text=js.read_text(encoding='utf8');frames=json.loads(text.split('const frames=')[1].split(';')[0])
for tank,file in FILES.items():
    path=source/f'{tank}-expansion-raw.png'
    if not path.exists():shutil.copy2(RAW/f'exec-{file}.png',path)
    a=np.array(Image.open(path).convert('RGBA'));labels,n=ndimage.label(a[:,:,3]>100);sizes=np.bincount(labels.ravel());objects=ndimage.find_objects(labels)
    ids=sorted([i for i in range(1,n+1) if sizes[i]>10000],key=lambda i:objects[i-1][1].start)
    assert len(ids)==6,(tank,len(ids))
    distance,indices=ndimage.distance_transform_edt(labels==0,return_indices=True);nearest=labels[tuple(indices)]
    frames[tank]=[]
    for stage,i in enumerate(ids):
        mask=(labels==i)|((labels==0)&(nearest==i)&(distance<=3));b=a.copy();b[:,:,3]=np.where(mask,a[:,:,3],0)
        im=Image.fromarray(b);im=im.crop(im.getbbox());im.save(runtime/f'{tank}-{stage}-v2.png');frames[tank].append(dict(width=im.width,height=im.height))
    print(tank,frames[tank])
js.write_text('const frames='+json.dumps(frames,separators=(',',':'))+';'+text.split(';',1)[1],encoding='utf8')
(runtime/'manifest-v2.json').write_text(json.dumps(frames,indent=2),encoding='utf8')

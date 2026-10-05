"""Twelve original Blender scenes with distinct architecture and packed GLB textures."""
from pathlib import Path
import json
base=Path(__file__).with_name('build-environments.py')
exec(compile(base.read_text(encoding='utf8').split('for theme in THEMES: make(theme)')[0],str(base),'exec'))
MAPS=json.loads((ROOT/'authoring/expansion-maps.json').read_text(encoding='utf8'))

def arch(name,x,y,z,r,mat):
    bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=.32,major_segments=48,minor_segments=8,location=(x,y,z),rotation=(math.pi/2,0,0))
    bpy.context.object.name=name;bpy.context.object.data.materials.append(mat)

def make_expansion(config):
    kind=config['id'];p={**THEMES[config['theme']]};rng=random.Random(kind)
    for key,value in {'orbital-station':{'sky':'#10172b','sun':'#93b1d6'},'abyss-base':{'sky':'#174251','sun':'#72b2c1'},'crystal-cavern':{'sky':'#3c2e50','sun':'#c6afe2'},'neon-docks':{'sky':'#313654','sun':'#cdb5d4'}}.get(kind,{}).items():p[key]=value
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    rock=[material(kind+' strata '+str(i),c) for i,c in enumerate(p['stone'])]
    metal=material(kind+' alloy',p['metal'],.6,.35);trim=material(kind+' trim',p['trim'],.3,.5)
    cap=material(kind+' mantle',p['cap']);dark=material(kind+' recess','#192c39',.35,.4)
    glow=material(kind+' lighting',{'neon-docks':'#ee74ed','volcanic-basin':'#ff6834','orbital-station':'#82baff','crystal-cavern':'#b588ff'}.get(kind,p['light']),.2,.25,2)
    # Foreground collision slabs are drawn by the game; this scene supplies deep scenery.
    if kind not in ['orbital-station','abyss-base','crystal-cavern','neon-docks']:
        for x in [-36,36]:cliff('Framing escarpment',x,42,15,25,12,rock,cap,rng)
    if kind=='cloud-garden':
        for x,y,z in [(-24,8,9),(24,8,9),(0,28,18),(-35,55,24),(35,55,24)]:
            cliff('Floating garden island',x,y,12,7,6,rock,cap,rng)
            for o in list(bpy.context.scene.objects)[-2:]:o.location.z+=z
            for dx in [-5,0,5]:cylinder('Terrace cypress',(x+dx,y,z+9),.8,5,cap)
            arch('Garden portal',x,y,z+7,4,trim)
    elif kind=='broken-bridge':
        for x in [-28,-18,18,28]:
            box('Fractured road deck',(x,18,8),(9,8,1),trim,.2)
            for y in [14,22]:beam('Suspension tower',(x,y,0),(x,y,20),.8,metal)
        for side in [-1,1]:beam('Severed suspension cable',(side*38,14,18),(side*10,14,9),.15,metal)
        box('River canyon',(0,40,.5),(150,130,.1),material('River','#3b849a',.4,.2),0)
    elif kind=='mine-canyon':
        for x in [-26,26]:
            cliff('Mine cliff',x,18,12,22,25,rock,cap,rng)
            for z in [6,12,18]:box('Mine timber gallery',(x,0,z),(13,4,.7),metal)
            for dx in [-4,4]:beam('Gallery support',(x+dx,0,1),(x+dx,0,20),.6,trim)
        for x in range(-30,31,6):beam('Railway sleeper',(x-2,4,1),(x+2,4,1),.3,metal)
        box('Ore wagon',(-10,5,3),(6,3,3),metal,.3)
    elif kind=='neon-docks':
        for x in [-30,-15,15,30]:
            for z in [2,6]:
                box('Cargo container',(x,20,z),(12,7,3.8),metal,.2)
                for dx in range(-5,6,2):box('Container ribs',(x+dx,16.4,z),(.13,.15,3.4),trim,.02)
            beam('Dock crane',(x,30,0),(x,30,23),.65,trim);beam('Crane boom',(x,30,23),(x+10,30,19),.5,trim)
            box('Neon cargo guide',(x,16.2,8),(10,.1,.15),glow,.02)
    elif kind=='crystal-cavern':
        for i in range(24):
            x=rng.uniform(-40,40);y=rng.uniform(5,65);z=rng.uniform(1,4)
            bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=rng.uniform(1,3),radius2=.1,depth=rng.uniform(4,14),location=(x,y,z+5))
            bpy.context.object.data.materials.append(glow if i%4==0 else trim)
        for x in [-32,32]:cliff('Cavern wall',x,40,12,35,27,rock,cap,rng)
        for x in [-26,-13,0,13,26]:
            box('Cavern ceiling',(x,48,32),(15,50,9),rock[1],2)
            bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=.1,radius2=2,depth=8,location=(x,27,24));bpy.context.object.data.materials.append(rock[0])
    elif kind=='glacier-rift':
        for x in [-24,24]:cliff('Split glacier',x,24,20,40,24,rock,cap,rng,True)
        for x in [-8,8]:
            for y in [0,15,30]:beam('Ice crevasse',(x,y,0),(x*.7,y,13),.35,glow)
        box('Frozen lake',(0,30,0),(150,130,.2),material('Blue ice','#6696b9',.3,.18),0)
    elif kind=='volcanic-basin':
        box('Lava basin',(0,30,.5),(130,130,.2),glow,0)
        for x in [-30,30]:cliff('Basalt rim',x,18,20,40,17,rock,dark,rng)
        for i in range(20):
            x=rng.uniform(-20,20);y=rng.uniform(2,60)
            cylinder('Basalt column',(x,y,2),rng.uniform(1,3),rng.uniform(3,8),dark,6)
    elif kind=='sea-fortress':
        box('Ocean',(0,35,0),(180,160,.1),material('Deep ocean','#2d607e',.5,.2),0)
        for x in [-26,26]:
            cylinder('Armoured sea tower',(x,20,8),7,16,metal,24)
            box('Fortress battlement',(x,20,17),(18,14,2),trim)
            for dx in [-5,5]:box('Sea artillery',(x+dx,20,19),(2,8,2),dark)
        beam('Fortress causeway',(-30,34,8),(30,34,8),2,trim)
    elif kind=='desert-ruins':
        for x in [-30,-15,0,15,30]:
            arch('Ancient arch',x,30,8,6,rock[1])
            for dx in [-5,5]:box('Carved ruin pillar',(x+dx,30,4),(2,3,8),rock[0],.2)
        for x in [-26,26]:cliff('Sand drift',x,0,12,10,4,rock,cap,rng)
    elif kind=='abyss-base':
        box('Abyss floor',(0,40,-1),(160,130,1),dark,0)
        for x in [-25,25]:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=13,location=(x,25,7))
            dome=bpy.context.object;dome.scale.z=.65;dome.data.materials.append(metal)
            for z in [7,10]:arch('Pressure ring',x,12,z,10,trim)
            box('Observation window',(x,12,8),(12,.3,3),glow)
        beam('Sealed transfer tunnel',(-25,30,5),(25,30,5),3,trim)
        for x in [-36,36]:cylinder('Vent stack',(x,40,9),2,18,dark)
    elif kind=='orbital-station':
        arch('Orbital habitat ring',0,44,21,25,trim);arch('Inner orbital ring',0,43,21,20,metal)
        for x in [-28,28]:
            box('Solar array',(x,20,13),(18,25,.5),dark)
            for dx in range(-8,9,4):box('Solar circuit',(x+dx,20,13.3),(.12,24,.04),glow,0)
            beam('Orbital truss',(x,20,12),(0,35,12),.8,metal)
        cylinder('Central habitat',(0,36,12),6,16,metal,24)
    else:
        for i in range(30):
            x=rng.uniform(-38,38);y=rng.uniform(7,60)
            box('Abandoned armoured hull',(x,y,rng.uniform(1,5)),(rng.uniform(3,8),4,2),metal,.3,rng.uniform(-1,1))
            arch('Discarded wheel',x,y,4,rng.uniform(1,3),dark)
        for x in [-28,28]:beam('Scrapyard gantry',(x,24,0),(x,24,22),.7,trim)
        beam('Gantry cross member',(-28,24,22),(28,24,22),.7,trim)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
    scene.render.resolution_x=1200;scene.render.resolution_y=675;scene.render.resolution_percentage=100
    scene.world.use_nodes=True;bg=scene.world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=rgba(p['sky']);bg.inputs['Strength'].default_value=.45
    bpy.ops.object.light_add(type='SUN',location=(35,-28,50));sun=bpy.context.object;sun.rotation_euler=(Vector((0,15,0))-sun.location).to_track_quat('-Z','Y').to_euler();sun.data.energy=2.2;sun.data.angle=.12
    bpy.ops.object.camera_add(location=(0,-82,36));camera=bpy.context.object;camera.rotation_euler=(Vector((0,22,12))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=28;scene.camera=camera
    scene.view_settings.view_transform='AgX';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/f'{kind}-v1.blend'))
    scene.render.filepath=str(OUT/f'{kind}-v1.png');bpy.ops.render.render(write_still=True)
    # Reuse the tested evaluated-mesh/material batching exporter.
    export_code=base.read_text(encoding='utf8').split('    original=[o for o in scene.objects')[1].split("    print(f'ENVIRONMENT_READY")[0]
    scope={**globals(),'scene':scene,'rock':rock,'theme':kind}
    exec('original=[o for o in scene.objects'+ '\n'.join(line[4:] if line.startswith('    ') else line for line in export_code.splitlines()),scope,scope)
    print('EXPANSION_READY',kind,flush=True)

for config in MAPS:
    if config['id'] in ['orbital-station','abyss-base','crystal-cavern','neon-docks'] or not (OUT/f"{config['id']}-v1.glb").exists():make_expansion(config)

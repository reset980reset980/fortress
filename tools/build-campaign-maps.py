"""Original campaign environments. Run in an isolated Blender background process.

blender --background --factory-startup --python tools/build-environments.py
Editable scenes stay under authoring/, runtime GLBs and previews under assets/.
"""
import bpy
import math
import random
import struct
import zlib
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'environments'
SOURCE = ROOT / 'authoring' / 'environments'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)

THEMES = {
    'coast': {'stone': ['#596e70', '#506466', '#475c60', '#627678'], 'cap': '#718777', 'metal': '#3c535a', 'trim': '#93a59e', 'light': '#77e5dd', 'water': '#366f83', 'sky': '#a1c5d0', 'sun': '#ffe1b1'},
    'desert': {'stone': ['#b47c55', '#ac7350', '#9e6848', '#bf895e'], 'cap': '#dfb382', 'metal': '#5a4d45', 'trim': '#aab1a6', 'light': '#ffc172', 'water': '#69574c', 'sky': '#d4b297', 'sun': '#ffdeaa'},
    'frost': {'stone': ['#778e9a', '#6d8491', '#607887', '#839ba7'], 'cap': '#d6e8eb', 'metal': '#384e61', 'trim': '#9fb4c1', 'light': '#8bedff', 'water': '#527b94', 'sky': '#adcadb', 'sun': '#e4f4ff'},
}

def rgba(hexcolor):
    rgb = tuple(int(hexcolor[i:i+2], 16) / 255 for i in (1, 3, 5))
    return (*(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb), 1)

def stone_texture(name, color):
    """Seamless authored rock colour/erosion texture, with no external assets."""
    n=256; yy,xx=np.mgrid[0:n,0:n]/n; rng=random.Random(name)
    prng=np.random.default_rng(sum((i+1)*ord(c) for i,c in enumerate(name)))
    def noise_field(frequency):
        grid=prng.random((frequency,frequency))*2-1
        x=xx*frequency; y=yy*frequency; ix=x.astype(int); iy=y.astype(int)
        tx=x-ix; ty=y-iy; tx=tx*tx*(3-2*tx); ty=ty*ty*(3-2*ty)
        a=grid[iy%frequency,ix%frequency]; b=grid[iy%frequency,(ix+1)%frequency]
        c=grid[(iy+1)%frequency,ix%frequency]; d=grid[(iy+1)%frequency,(ix+1)%frequency]
        return (a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+d*tx)*ty
    noise=np.zeros((n,n))
    for frequency,amp in [(2,.17),(4,.12),(8,.075),(16,.04),(32,.025),(64,.015)]:
        noise+=noise_field(frequency)*amp
    bands=np.sin(yy*math.tau*9+noise_field(4)*1.8)*.014
    noise+=prng.normal(0,.008,(n,n))
    base=np.array([int(color[i:i+2],16) for i in (1,3,5)])
    pixels=np.uint8(np.clip(base[None,None,:]*(1+noise[:,:,None]+bands[:,:,None]),0,255))
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    raw=b''.join(b'\0'+row.tobytes() for row in pixels)
    path=OUT/(name.replace(' ','-')+'.png')
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',n,n,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))
    return bpy.data.images.load(str(path))

def material(name, color, metallic=0, roughness=.8, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = rgba(color)
    m.use_nodes = True
    node = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    node.inputs['Base Color'].default_value = rgba(color)
    node.inputs['Metallic'].default_value = metallic
    node.inputs['Roughness'].default_value = roughness
    if emission:
        node.inputs['Emission Color'].default_value = rgba(color)
        node.inputs['Emission Strength'].default_value = emission
    if 'strata' in name:
        texture=m.node_tree.nodes.new('ShaderNodeTexImage'); texture.image=stone_texture(name,color)
        m.node_tree.links.new(texture.outputs['Color'],node.inputs['Base Color'])
    return m

def mesh(name, vertices, faces, materials, indices=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    for m in materials: data.materials.append(m)
    if indices:
        for p, i in zip(data.polygons, indices): p.material_index = i
    uv=data.uv_layers.new(name='Stone projection')
    for face in data.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]))
        for loop in face.loop_indices:
            v=data.vertices[data.loops[loop].vertex_index].co
            uv.data[loop].uv=((v.y if axis==0 else v.x)/7,(v.y if axis==2 else v.z)/7)
    return obj

def box(name, location, size, mat, bevel=.12, rotation=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    o = bpy.context.object
    o.name = name
    o.dimensions = size
    o.rotation_euler.z = rotation
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        b = o.modifiers.new('Weathered machined edges', 'BEVEL'); b.width = bevel; b.segments = 2
        o.modifiers.new('Weighted surface normals', 'WEIGHTED_NORMAL')
    return o

def cylinder(name, loc, radius, depth, mat, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    o=bpy.context.object; o.name=name; o.data.materials.append(mat)
    b=o.modifiers.new('Edge rounds','BEVEL'); b.width=.06; b.segments=2
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def beam(name, start, end, width, mat):
    a,b=Vector(start),Vector(end)
    o=box(name,(a+b)/2,(width,width,(b-a).length),mat,width*.12)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return o

def cliff(name,x,y,rx,ry,height,mats,cap,rng, alpine=False):
    """Irregular eroded stratified rock, with radial shelves and split ridges."""
    count=36; rings=12; vertices=[]
    jagged=[rng.uniform(.86,1.13) for _ in range(count)]
    for level in range(rings):
        t=level/(rings-1)
        taper=(1-t*.72) if alpine else (1-t*.27 + math.sin(t*15)*.035)
        for j in range(count):
            a=j/count*math.tau
            peak=(math.sin(a*3+.8)*.10+math.cos(a*5)*.04)
            z=height*t*(1+peak*t)+rng.uniform(-.25,.25)
            vertices.append((x+math.cos(a)*rx*taper*jagged[j],y+math.sin(a)*ry*taper*jagged[j],max(-.2,z)))
    top=len(vertices); vertices.append((x+rx*.1,y,height*(1.22 if alpine else 1.01)))
    faces=[]; ids=[]
    for level in range(rings-1):
        for j in range(count):
            a=level*count+j; b=level*count+(j+1)%count; c=(level+1)*count+(j+1)%count; d=(level+1)*count+j
            faces.extend([(a,b,c),(a,c,d)])
            idx=(len(mats) if alpine and level>=8 else min(len(mats)-1,level//4))
            ids.extend([idx,idx])
    for j in range(count):
        faces.append(((rings-1)*count+j,(rings-1)*count+(j+1)%count,top)); ids.append(len(mats))
    obj=mesh(name,vertices,faces,mats+[cap],ids)
    for face in obj.data.polygons: face.use_smooth=True
    return obj

def landscape(theme,mats,cap,rng):
    # A broad valley opens toward the camera; elevations remain beyond the firing lane.
    verts=[]; faces=[]; ids=[]; nx=76; ny=42
    for j in range(ny):
        y=-15+j*2.8
        for i in range(nx):
            x=-100+i*2.7
            h=.35+math.sin(x*.12+y*.17)*.6+math.cos(x*.28-y*.08)*.4
            h+=max(0,y-31)*.07 + max(0,abs(x)-25)*.06
            if theme=='coast':h-=math.exp(-(x/29)**4)*5
            verts.append((x,y,h))
    for j in range(ny-1):
        for i in range(nx-1):
            a=j*nx+i; faces.extend([(a,a+1,a+nx),(a+1,a+nx+1,a+nx)])
            ids.extend([1]*2)
    mesh('Exposed valley bed',verts,faces,mats,ids)
    # Background ridges, then distinct midground mesas: real depth, not layered silhouettes.
    for i in range(10):
        x=-88+i*19+rng.uniform(-3,3)
        if theme=='coast' and -30<x<35: continue
        cliff(f'Distant ridge {i}',x,(90 if theme=='coast' else 66)+rng.uniform(-7,8),14,12,rng.uniform(13,23) if theme=='coast' else rng.uniform(18,32),mats,cap,rng,theme=='frost')
    positions=[(-49,28,17,13,22),(-30,36,10,12,17),(44,28,14,13,23),(67,39,17,16,30)]
    if theme=='desert': positions=[(-47,17,17,12,23),(-26,41,12,14,28),(43,21,15,12,25),(64,43,19,17,33)]
    if theme=='frost': positions=[(-45,25,16,14,28),(-29,39,10,10,32),(43,24,13,15,30),(64,43,17,14,35)]
    if theme=='coast': positions=[(-49,31,16,13,16),(-36,53,10,12,12),(45,42,14,13,14),(67,61,17,16,23)]
    for i,p in enumerate(positions): cliff(f'Carved cliff {i}',*p,mats,cap,rng,theme=='frost')
    for i in range(26):
        x=rng.choice([-1,1])*rng.uniform(22,66); y=rng.uniform(-2,39)
        cliff(f'Talus boulder {i}',x,y,rng.uniform(1,3),rng.uniform(1,2.7),rng.uniform(1.4,4),mats,cap,rng)

def outpost(theme,metal,trim,dark,glow,cap):
    cx=9 if theme!='desert' else -7; cy=19; base=1.5
    box('Relay platform',(cx,cy,base),(17,13,2),dark,.3)
    for dx in (-7.5,7.5):
        box('Fortress wing',(cx+dx,cy,4.1),(3,10,5),metal,.3)
        box('Sloped parapet',(cx+dx,cy,6.9),(3.5,10.8,.7),trim,.15)
        for y in range(-3,5,3): box('Armour ribs',(cx+dx,cy+y,4.2),(3.2,.32,4.8),trim,.04)
    box('Operations bunker',(cx,cy,4.2),(11,9,4.5),metal,.45)
    box('Stepped roof',(cx,cy,6.7),(12,10,1),trim,.22)
    box('Observation room',(cx,cy+1,8.3),(7,6,2.4),metal,.24)
    box('Control room glass',(cx,cy-2.04,8.25),(5.6,.1,.65),glow,.04)
    for dx in [-1.8,0,1.8]:box('Window dividers',(cx+dx,cy-2.13,8.25),(.13,.16,.9),dark,.01)
    for dx in (-4.1,4.1):
        box('Angled brace',(cx+dx,cy-4.8,4),(1.2,1.8,4.8),trim,.17)
    box('Blast door',(cx,cy-4.57,3.6),(3,.1,2.8),dark,.1)
    box('Door signal strip',(cx,cy-4.66,5.35),(3.2,.14,.16),glow,.02)
    # Tower tapers upward with structural diagonals and a rotating dish in the runtime.
    tx=cx+3; ty=cy+2
    for i in range(4):
        z=10+i*2.5; half=1.6-i*.23
        for dx in (-half,half):
            for dy in (-half,half):beam('Relay frame',(tx+dx,ty+dy,z-1.3),(tx+dx*.88,ty+dy*.88,z+1.3),.18,trim)
        for dy in (-half,half):beam('Cross bracing',(tx-half,ty+dy,z-1.3),(tx+half,ty+dy,z+1.3),.11,metal)
        box('Antenna service deck',(tx,ty,z+1.2),(half*2.4,half*2.4,.22),metal,.03)
    cylinder('Antenna mast',(tx,ty,21),.15,5,trim)
    cylinder('Signal beacon',(tx,ty,23.6),.23,.45,glow)
    # Sculpted parabolic dish with a rim and receiver support.
    verts=[(0,0,0)]; faces=[]; segments=40; rings=6
    for r in range(1,rings+1):
        radius=2.7*r/rings
        for j in range(segments):
            a=j/segments*math.tau; verts.append((radius*math.cos(a),radius*math.sin(a),radius*radius*.14))
    for j in range(segments):faces.append((0,1+j,1+(j+1)%segments))
    for r in range(rings-1):
        for j in range(segments):
            a=1+r*segments+j; b=1+r*segments+(j+1)%segments; faces.append((a,b,b+segments,a+segments))
    dish=mesh('Relay dish',verts,faces,[trim]); dish.location=(tx-3,ty,13.6); dish.rotation_euler=(math.radians(67),math.radians(-15),math.radians(-28))
    solid=dish.modifiers.new('Dish shell','SOLIDIFY'); solid.thickness=.08
    for dx in [-4,0,4]:
        box('Roof ventilation',(cx+dx,cy+1,7.5),(1.6,2.7,.9),dark,.1)
        for j in range(4):box('Vent louvres',(cx+dx,cy+.2+j*.45,8),(1.3,.12,.1),trim,.01)
    for i in range(6):
        box('Access stair',(cx-11.8+i*.4,cy-4,base-.4+i*.18),(1,3,.35),trim,.04)
    if theme=='frost':
        box('Snow-covered bunker roof',(cx,cy,7.24),(12.1,10.1,.18),cap,.1)
        box('Snow-covered control roof',(cx,cy+1,9.65),(7.3,6.3,.3),cap,.1)

def bridge(theme,metal,trim,dark,glow):
    # Receding bridge exposes its upper deck, supports and visible underside.
    for i in range(8):
        x=-29+i*2; y=3+i*2.8
        box('Causeway segment',(x,y,2.3),(3,3.5,.55),trim,.08,rotation=-.57)
        for side in [-1,1]:beam('Bridge railing',(x+side*1.5,y-1,3.4),(x+side*1.5+2,y+1.8,3.4),.12,metal)
        if i%2==0:
            beam('Bridge pier',(x,y,-.5),(x,y,2.4),.8,dark)
            box('Navigation light',(x-1.5,y,3.4),(.2,.2,.25),glow,.02)
    if theme=='coast':
        for x in [-34,-27]:
            box('Harbour gantry base',(x,10,2),(3,4,3),metal,.2)
            beam('Crane column',(x,10,3),(x,10,11),.42,trim)
            beam('Crane boom',(x,10,11),(x+6,10,13),.35,trim)
            beam('Crane cable',(x+5,10,12.7),(x+5,10,4),.05,dark)
    elif theme=='desert':
        # Broken aqueduct arches are custom geometry rather than cube stacks.
        for x in [20,27,34]:
            vs=[]; fs=[]
            for side in [-.8,.8]:
                for radius in [2.5,3.2]:
                    for i in range(17):
                        a=math.pi*i/16; vs.append((x+math.cos(a)*radius,30+side,3+math.sin(a)*radius))
            for i in range(16):
                fs.extend([(i,i+1,17+i+1,17+i),(34+i,51+i,51+i+1,34+i+1),(i,34+i,34+i+1,i+1),(17+i,17+i+1,51+i+1,51+i)])
            mesh('Weathered aqueduct arch',vs,fs,[trim])
            for dx in [-2.85,2.85]:box('Aqueduct pillar',(x+dx,30,1.5),(.7,1.6,3),trim,.13)

def make(theme, map_id, variant):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    rng=random.Random({'coast':51,'desert':85,'frost':112}[theme]+variant*127); p=THEMES[theme]
    rock=[material(f'{theme} strata {i}',c) for i,c in enumerate(p['stone'])]
    cap=material('Surface mantle',p['cap']); metal=material('Oxidised armour',p['metal'],.45,.52)
    trim=material('Concrete and brushed alloy',p['trim'],.15,.65); dark=material('Recesses','#24353b',.15)
    glow=material('Relay lighting',p['light'],.15,.3,2.2)
    landscape(theme,rock,cap,rng)
    if theme=='coast':cliff('Relay island',9,19,13,10,1.6,rock,cap,rng)
    if theme!='desert':
        water=material('Tidal water' if theme=='coast' else 'Glacial lake',p['water'],.4,.24)
        water_level=.82 if theme=='coast' else .44
        box('Water surface',(0,36,water_level),(170,160,.08),water,0)
        # Long slim ripples make perspective and reflectivity legible at gameplay scale.
        ripple=material('Water glints','#aacbd0' if theme=='coast' else '#b9deec',.35,.35)
        for i in range(24):
            x=rng.uniform(-28,28); y=rng.uniform(-9,29)
            box('Tidal glint',(x,y,water_level+.06),(rng.uniform(.5,4),.035,.01),ripple,0)
    if variant == 2:
        if theme == 'coast':
            for x in range(-40,41,8):
                box('Sea wall',(x,20,4),(8,5,8),trim,.25)
                box('Sea wall crest',(x,20,8.3),(8.3,5.5,.7),metal,.12)
            bridge(theme,metal,trim,dark,glow)
        elif theme == 'desert':
            for x in [-24,24]:
                cliff('Canyon gate',x,15,10,16,25,rock,cap,rng)
            for x in [-38,38]:
                box('Supply depot',(x,25,4),(12,9,7),metal,.3)
        else:
            for x in [-24,24]:
                cliff('Ice gate pillar',x,22,10,12,33,rock,cap,rng,True)
            beam('Frozen arch',(-24,22,30),(24,22,30),5,cap)
            for x in range(-32,33,8):box('Icebound checkpoint',(x,15,3),(7,4,5),trim,.2)
    else:
        outpost(theme,metal,trim,dark,glow,cap)
        if theme == 'coast':
            for x in [-35,-15,30,48]:
                for z in [2,5]:box('Harbour cargo',(x,8,z),(12,7,3),metal,.15)
                beam('Loading crane',(x,14,0),(x,14,20),.6,trim)
                beam('Loading boom',(x,14,20),(x-10,14,20),.6,trim)
        elif theme == 'desert':
            for x in range(-40,41,10):
                box('Citadel rampart',(x,27,8),(10,5,14),trim,.25)
                for dx in [-3,3]:box('Citadel crenellation',(x+dx,27,16),(3,5,3),metal,.1)
            for x in [-35,35]:box('Citadel watchtower',(x,23,12),(12,12,23),metal,.35)
        else:
            for x in [-34,34]:
                cylinder('Signal reactor',(x,20,10),7,18,metal,20)
                cylinder('Reactor crown',(x,20,20),8,2,trim,20)
                cylinder('Beacon core',(x,20,25),2,9,glow,16)
            for x in range(-32,33,8):box('Final barricade',(x,8,3),(7,3,5),trim,.2)
    # Terrain and outpost alone are game assets. Lighting/camera are presentation.
    scene=bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.samples=32
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1600; scene.render.resolution_y=900; scene.render.resolution_percentage=100
    scene.world.use_nodes=True
    bg=scene.world.node_tree.nodes.get('Background'); bg.inputs['Color'].default_value=rgba(p['sky']); bg.inputs['Strength'].default_value=.55
    bpy.ops.object.light_add(type='SUN',location=(35,-28,50)); light=bpy.context.object
    light.name='Warm raking sunlight'; light.rotation_euler=(Vector((0,15,0))-light.location).to_track_quat('-Z','Y').to_euler(); light.data.energy=2.2; light.data.angle=.12; light.data.color=rgba(p['sun'])[:3]
    bpy.ops.object.light_add(type='AREA',location=(0,-20,25)); fill=bpy.context.object
    fill.data.energy=1400; fill.data.shape='DISK'; fill.data.size=35; fill.rotation_euler=(Vector((0,18,7))-fill.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(0,-82,36)); camera=bpy.context.object
    camera.name='Campaign camera'; camera.rotation_euler=(Vector((0,22,12))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='PERSP'; camera.data.lens=28; camera.data.clip_end=400
    scene.camera=camera; scene.view_settings.view_transform='AgX'
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/f'{map_id}-v1.blend'))
    scene.render.filepath=str(OUT/f'{map_id}-v1.png'); bpy.ops.render.render(write_still=True)
    # Merge evaluated meshes by material into an isolated export collection. The editable
    # scene remains untouched, while runtime draw calls stay modest on phones.
    original=[o for o in scene.objects if o.type=='MESH']
    export=bpy.data.collections.new('Runtime export'); scene.collection.children.link(export)
    deps=bpy.context.evaluated_depsgraph_get(); groups={}
    for o in original:
        evaluated=o.evaluated_get(deps); m=evaluated.to_mesh()
        for face in m.polygons:
            mat=m.materials[face.material_index] if len(m.materials) else rock[0]
            verts,faces,normals,uvs=groups.setdefault(mat.name,([],[],[],[])); offset=len(verts)
            verts.extend(tuple(o.matrix_world@m.vertices[i].co) for i in face.vertices)
            normal_matrix=o.matrix_world.to_3x3().inverted().transposed()
            normals.extend(tuple((normal_matrix@m.corner_normals[loop].vector).normalized()) for loop in face.loop_indices)
            uvs.extend(tuple(m.uv_layers.active.data[loop].uv) for loop in face.loop_indices)
            faces.append(tuple(range(offset,offset+len(face.vertices))))
        evaluated.to_mesh_clear()
    bpy.ops.object.select_all(action='DESELECT')
    for name,(vertices,faces,normals,uvs) in groups.items():
        # Preserve normals/UV seams, but remove redundant triangle-corner vertices.
        # This substantially reduces transfer and offline-cache size without a decoder.
        unique={}; remap=[]; welded=[]; welded_normals=[]; welded_uvs=[]
        for vertex,normal,uv in zip(vertices,normals,uvs):
            key=tuple(round(v,6) for v in (*vertex,*normal,*uv))
            index=unique.get(key)
            if index is None:
                index=len(welded); unique[key]=index
                welded.append(vertex); welded_normals.append(normal); welded_uvs.append(uv)
            remap.append(index)
        vertices=welded; normals=welded_normals; uvs=welded_uvs
        faces=[tuple(remap[index] for index in face) for face in faces]
        obj=mesh(name,vertices,faces,[bpy.data.materials[name]])
        obj.data.normals_split_custom_set_from_vertices(normals)
        for face in obj.data.polygons:
            for loop in face.loop_indices:
                obj.data.uv_layers.active.data[loop].uv=uvs[obj.data.loops[loop].vertex_index]
        for c in list(obj.users_collection): c.objects.unlink(obj)
        export.objects.link(obj); obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{map_id}-v1.glb'),export_format='GLB',use_selection=True,export_cameras=False,export_lights=False)
    print(f'ENVIRONMENT_READY {theme}',flush=True)


for theme,prefix in [("coast","shore"),("desert","dune"),("frost","frost")]:
    for variant in [2,3]: make(theme,f"{prefix}-{variant:02d}",variant)

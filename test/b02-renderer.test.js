import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlan} from '../public/lib/catalog.js';
import {LED_SIZE,renderFrame} from '../public/lib/renderer.js';

const seeds=[0,72,1827,4589,0xffffffff];
const appearances=[
  {label:'default receipt colors',overrides:{},options:{}},
  {label:'voice listening colors',overrides:{paletteFamily:'sea_glass'},options:{}},
  {label:'one selected color',overrides:{},options:{colors:[[116,173,255]]}},
];

function pixels(frame) {
  assert.equal(frame.length,LED_SIZE*LED_SIZE*3);
  return Array.from({length:LED_SIZE*LED_SIZE},(_,index)=>{
    const rgb=Array.from(frame.slice(index*3,index*3+3));
    return {x:(index%LED_SIZE+.5)/LED_SIZE,y:(Math.floor(index/LED_SIZE)+.5)/LED_SIZE,
      rgb,chroma:Math.max(...rgb)-Math.min(...rgb)};
  });
}

// Locate the displayed ball from its emitted color, rather than duplicating
// the renderer's seeded placement or the private geometry of its primitives.
function colorCenter(frame) {
  const emitted=pixels(frame),total=emitted.reduce((sum,pixel)=>sum+pixel.chroma,0);
  assert.ok(total>0,'the opening contains a visible colored ball');
  return {x:emitted.reduce((sum,pixel)=>sum+pixel.x*pixel.chroma,0)/total,
    y:emitted.reduce((sum,pixel)=>sum+pixel.y*pixel.chroma,0)/total};
}

function spatialProfile(frame,center) {
  const emitted=pixels(frame).map(pixel=>({...pixel,radius:Math.hypot(pixel.x-center.x,pixel.y-center.y)}));
  const total=emitted.reduce((sum,pixel)=>sum+pixel.chroma,0);
  return {emitted,area:emitted.filter(pixel=>pixel.chroma>18).length,
    meanRadius:emitted.reduce((sum,pixel)=>sum+pixel.radius*pixel.chroma,0)/total,
    core:emitted.filter(pixel=>pixel.radius<.11),
    outside:emitted.filter(pixel=>pixel.radius>.15)};
}

for(const appearance of appearances) {
  test(`B02 visibly enlarges the filled ball before release (${appearance.label})`,()=>{
    for(const seed of seeds) {
      const plan=createPlan('acknowledge',{seed,...appearance.overrides});
      const opening=renderFrame(plan,0,appearance.options),center=colorCenter(opening);
      const early=spatialProfile(opening,center);
      const growing=spatialProfile(renderFrame(plan,125,appearance.options),center);
      const grown=spatialProfile(renderFrame(plan,250,appearance.options),center);
      assert.ok(growing.area>early.area,`seed ${seed}: the ball has already spread after 125 ms`);
      assert.ok(grown.area>early.area*2,`seed ${seed}: growth covers substantially more actual LEDs`);
      assert.ok(grown.meanRadius>early.meanRadius*1.5,`seed ${seed}: the ball expands rather than only changing brightness`);
      assert.ok(grown.core.every(pixel=>pixel.chroma>25),`seed ${seed}: the growing form remains filled`);
    }
  });

  test(`B02 releases a visible hollow ring and removes the central ball (${appearance.label})`,()=>{
    for(const seed of seeds) {
      const plan=createPlan('acknowledge',{seed,...appearance.overrides});
      const center=colorCenter(renderFrame(plan,0,appearance.options));
      const released=spatialProfile(renderFrame(plan,500,appearance.options),center);
      assert.ok(released.core.length>=4,'the central check spans multiple physical LEDs');
      assert.ok(released.core.every(pixel=>pixel.rgb.every(channel=>channel>=250)),
        `seed ${seed}: the center is the lit white surface, without a colored ball or a black hole`);
      assert.ok(released.area>=24,`seed ${seed}: the ring remains clearly visible after the center disappears`);
      assert.ok(Math.max(...released.outside.map(pixel=>pixel.chroma))>30,
        `seed ${seed}: removal of the ball does not erase the outward light`);
      const sectors=new Set(released.outside.filter(pixel=>pixel.chroma>20).map(pixel=>{
        const angle=Math.atan2(pixel.y-center.y,pixel.x-center.x)+Math.PI;
        return Math.floor(angle/(Math.PI*2)*8)%8;
      }));
      assert.equal(sectors.size,8,`seed ${seed}: colored light surrounds the empty center, rather than forming one side blob`);
    }
  });

  test(`B02 ring travels outward at observable 125 ms intervals without refilling its center (${appearance.label})`,()=>{
    for(const seed of seeds) {
      const plan=createPlan('acknowledge',{seed,...appearance.overrides});
      const center=colorCenter(renderFrame(plan,0,appearance.options));
      let priorRadius;
      for(const elapsed of [500,625,750]) {
        const profile=spatialProfile(renderFrame(plan,elapsed,appearance.options),center);
        if(priorRadius!==undefined)assert.ok(profile.meanRadius>priorRadius+.04,
          `seed ${seed}: the annulus moves outward between observations at ${elapsed} ms`);
        assert.ok(profile.core.every(pixel=>pixel.rgb.every(channel=>channel>=250)),
          `seed ${seed}: no residual ball appears while the ring expands`);
        priorRadius=profile.meanRadius;
      }
      const endpoint=renderFrame(plan,plan.durationMs,appearance.options);
      assert.deepEqual(renderFrame(plan,plan.durationMs+60000,appearance.options),endpoint,
        'a delayed next response cannot restart the ball after the receipt finishes');
      assert.ok(spatialProfile(endpoint,center).core.every(pixel=>pixel.rgb.every(channel=>channel>=250)),
        'the endpoint also leaves the central ball absent');
    }
  });
}

test('reduced-motion B02 retains a static, hollow receipt instead of replaying growth',()=>{
  for(const seed of seeds) {
    const plan=createPlan('acknowledge',{seed});
    const options={reducedMotion:true},frame=renderFrame(plan,0,options);
    assert.deepEqual(renderFrame(plan,125,options),frame);
    assert.deepEqual(renderFrame(plan,60000,options),frame);
    const center=colorCenter(renderFrame(plan,0));
    const profile=spatialProfile(frame,center);
    assert.ok(profile.area>=12,'the static acknowledgment remains visible');
    assert.ok(profile.core.every(pixel=>pixel.rgb.every(channel=>channel>=250)),
      'reduced motion does not restore a filled central ball');
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from '../server.js';
import { SessionController } from '../public/lib/controller.js';
import { createScenePlan, validatePlan } from '../public/lib/planner.js';
import { renderFrame } from '../public/lib/renderer.js';

const completed = plan => ({ ok:true, json:async () => ({ status:'completed', output:[{type:'message', content:[{type:'output_text',text:JSON.stringify(plan)}]}] }) });
class Renderer {
  setPlan(plan, options) { this.plan=plan; this.options=options; }
  setPaused() {}
  finish() { this.onComplete(this.plan); }
  frameAt(time) { return renderFrame(this.plan,time,this.options); }
}

test('adaptive AI orchestration reaches the displayed RGB and survives study save and restore', async t => {
  const quiet = createScenePlan('setback','default',{seed:1827,intensity:.25,speed:.23,energy:.37,durationMs:11000,
    composition:{waveCount:2,waveWidth:1.25,spotCount:2,accentScale:.7,accentWeight:.5,stagger:1.4}});
  const pronounced = createScenePlan('setback','default',{seed:1827,intensity:.9,speed:.5,energy:.65,durationMs:9500,
    composition:{waveCount:4,waveWidth:.85,spotCount:7,accentScale:1.4,accentWeight:1.35,stagger:.75}});
  let current = quiet;
  const server = createServer({keyProvider:async ()=>'test-key',fetchImpl:async ()=>completed(current)});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const staticResponse=await fetch(`${origin}/lib/composition.js`);
  assert.equal(staticResponse.status,200);
  assert.match(await staticResponse.text(),/COMPOSITION_DEFAULTS/);
  const renderer = new Renderer();
  const controller = new SessionController({renderer,mode:'ai',requestPlan:async (payload,signal)=>{
    const result=await fetch(`${origin}/api/plan`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(payload),signal});
    return result.json();
  }});
  await controller.submit('今天有点不顺，心里闷闷的'); renderer.finish();
  assert.equal(controller.source,'ai'); assert.ok(validatePlan(controller.plan));
  assert.equal(controller.plan.composition.waveCount,2);
  const firstFrame=renderer.frameAt(5000);
  controller.saveScene();
  const exported=controller.exportScene();
  assert.deepEqual(exported.plan.composition,controller.plan.composition);
  assert.equal(JSON.stringify(exported).includes('闷闷的'),false);
  current=pronounced;
  await controller.submit('今天太生气了，一件接一件出问题'); renderer.finish();
  assert.equal(controller.plan.composition.waveCount,3);
  assert.equal(controller.plan.composition.spotCount,7);
  assert.notDeepEqual(renderer.frameAt(5000),firstFrame,'different AI plans must change the actual 768-byte light frame');
  controller.restoreScene(0);
  assert.deepEqual(renderer.frameAt(5000),firstFrame,'restoring a saved light reproduces its geometry, timing and colors');
  exported.plan.composition.waveCount=4;
  assert.equal(controller.plan.composition.waveCount,2,'exported plans cannot mutate the live scene');
});

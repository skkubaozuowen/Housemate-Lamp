import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAnalysis } from '../emotion.js';
const result = { emotion:'疲惫', secondary:[], intensity:'中等', certainty:'线索清晰', expression:'情绪倾诉', evidence:['很累'], explanation:'文字表达疲惫。', response:'可以先歇一会儿。' };
test('accepts grounded evidence',()=>assert.equal(validateAnalysis(result,'今天很累'),true));
test('rejects invented evidence',()=>assert.equal(validateAnalysis(result,'今天很开心'),false));
test('rejects unsupported emotion labels',()=>assert.equal(validateAnalysis({...result,emotion:'抑郁症'},'今天很累'),false));
test('rejects duplicate primary/secondary labels',()=>assert.equal(validateAnalysis({...result,secondary:['疲惫']},'很累'),false));

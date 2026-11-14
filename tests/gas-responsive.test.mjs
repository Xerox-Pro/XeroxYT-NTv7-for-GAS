import {test} from 'node:test';
import assert from 'node:assert/strict';
import {viewportMetrics,mediaForWidth} from '../gas/client/responsive.mjs';
test('inflated GAS phone viewport uses physical CSS screen width without changing desktop and normal tablet layouts',()=>{
 const phone={innerWidth:980,navigator:{userAgent:'Android Mobile'},screen:{width:393}};
 assert.equal(viewportMetrics(phone).width,393);assert.equal(viewportMetrics(phone).zoom,980/393);
 assert.deepEqual(viewportMetrics({...phone,innerWidth:393}),{width:393,zoom:1});
 assert.deepEqual(viewportMetrics({...phone,navigator:{userAgent:'Desktop'},screen:{width:1920}}),{width:980,zoom:1});
 assert.deepEqual(viewportMetrics({...phone,innerWidth:1024,navigator:{userAgent:'iPad'},screen:{width:1024}}),{width:1024,zoom:1});
});
test('phone CSS disables desktop breakpoints and keeps non-width media tests intact',()=>{
 const css='@media (width>=40rem){.grid{display:grid}}@media(max-width:767px){.nav{display:flex}}@media(orientation:landscape){.other{color:red}}';
 const phone=mediaForWidth(css,393),desktop=mediaForWidth(css,1440);
 assert.match(phone,/@media \(min-width:10000000px\)/);assert.match(phone,/@media \(min-width:0px\)\{\.nav/);
 assert.ok(phone.includes('@media (orientation:landscape)'));
 assert.match(desktop,/@media \(min-width:0px\)\{\.grid/);assert.match(desktop,/@media \(min-width:10000000px\)\{\.nav/);
});

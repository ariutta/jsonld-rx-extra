var JsonldRx = require('../../index.js');
var jsonldRx = new JsonldRx();

var globalContext = [];
globalContext.push('https://wikipathwayscontexts.firebaseio.com/biopax/.json');
globalContext.push('https://wikipathwayscontexts.firebaseio.com/organism/.json');
globalContext.push('https://wikipathwayscontexts.firebaseio.com/cellularLocation/.json');
globalContext.push('https://wikipathwayscontexts.firebaseio.com/display/.json');
globalContext.push('https://wikipathwayscontexts.firebaseio.com/bridgedb/.json');

jsonldRx.mergeContexts(globalContext)
.subscribe(function(value) {
  console.log(value);
});

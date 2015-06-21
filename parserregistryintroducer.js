function parserRegistryIntroducer(execlib){
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite,
    parserRegistry = execSuite.parserRegistry;
  if(parserRegistry){
    return;
  }
  function ParserRegistry(){
    lib.Map.call(this);
  }
  lib.inherit(ParserRegistry,lib.Map);
  ParserRegistry.prototype.register = function (modulename) {
    var d = q.defer();
    try{
      var parserctor = this.get(modulename);
      if(!parserctor){
        parserctor = require(modulename)(execlib);
        this.add(modulename,parserctor);
      }
      d.resolve(parserctor);
    }
    catch(e){
      console.log(e.stack);
      console.log(e);
      d.reject(e);
    }
    return d.promise;
  };
  ParserRegistry.prototype.spawn = function (modulename, prophash) {
    var d = q.defer();
    this.register(modulename).done(
      function(parserctor){
        d.resolve(new parserctor(prophash||{}));
      },
      d.reject.bind(d)
    );
    return d.promise;
  };
  execSuite.parserRegistry = new ParserRegistry();
}

module.exports = parserRegistryIntroducer;

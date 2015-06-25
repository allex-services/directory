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
  ParserRegistry.prototype.register = function (modulename,defer) {
    var d = defer || q.defer();
    try{
      var parserctor = this.get(modulename);
      if(!parserctor){
        parserctor = require(modulename)(execlib);
        this.add(modulename,parserctor);
      }
      d.resolve(parserctor);
    }
    catch(e){
      if(execSuite.installFromError){
        execSuite.installFromError(this.onInstallFromError.bind(this,modulename,d,e),e);
      }else{
        console.log(e.stack);
        console.log(e);
        d.reject(e);
      }
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
  ParserRegistry.prototype.onInstallFromError = function (modulename,defer,error,ok) {
    if(ok){
      this.register(modulename,defer);
    }else{
      defer.reject(error);
    }
  };
  execSuite.parserRegistry = new ParserRegistry();
}

module.exports = parserRegistryIntroducer;

var fs = require('fs');

function createDirectoryService(execlib,ParentServicePack){
  'use strict';
  var ParentService = ParentServicePack.Service,
    lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite,
    parserRegistry = execSuite.parserRegistry,
    util = require('./util')(execlib);

  function factoryCreator(parentFactory){
    return {
      'service': require('./users/serviceusercreator')(execlib,parentFactory.get('service')),
      'user': require('./users/usercreator')(execlib,parentFactory.get('user')) 
    };
  }


  function DirectoryService(prophash){
    ParentService.call(this,prophash);
    if(!('path' in prophash)){
      throw new lib.Error('propertyhash misses the path field');
    }
    util.satisfyPath(prophash.path);
    this.state.set('path',prophash.path);
  }
  ParentService.inherit(DirectoryService,factoryCreator);
  DirectoryService.prototype.__cleanUp = function(){
    if(!this.parser){
      return;
    }
    this.parser.destroy();
    this.parser = null;
    ParentService.prototype.__cleanUp.call(this);
  };
  DirectoryService.prototype.pathForFilename = function(filename){
    return util.pathForFilename(this.state.get('path'),filename);
  };
  DirectoryService.prototype.fileSize = function(filename){
    return util.fileSize(filename);
  };
  DirectoryService.prototype.dataToFile = function(parserinfo,data){
    var d = q.defer();
    parserRegistry.spawn(parserinfo.modulename,parserinfo.propertyhash).done(
      function(parser){
        d.resolve(parser.dataToFile(data));
        parser.destroy();
      },
      d.reject.bind(d)
    );
    return d.promise;
  };
  DirectoryService.prototype.fileToData = function(parserinfo,chunk,defer){
    parserRegistry.spawn(parserinfo.modulename,parserinfo.propertyhash).done(
      function(parser){
        defer.resolve(parser.fileToData(chunk));
        parser.destroy();
      },
      defer.reject.bind(defer)
    );
  };
  
  return DirectoryService;
}

module.exports = createDirectoryService;

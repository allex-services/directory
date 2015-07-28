var fs = require('fs');

function createDirectoryService(execlib,ParentServicePack){
  'use strict';
  var ParentService = ParentServicePack.Service,
    lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite,
    fileApi = require('./fileapi/creator')(execlib);

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
    fileApi.util.satisfyPath(prophash.path);
    this.state.set('path',prophash.path);
    this.db = new (fileApi.DataBase)(prophash.path);
  }
  ParentService.inherit(DirectoryService,factoryCreator);
  DirectoryService.prototype.__cleanUp = function(){
    this.db.destroy();
    this.db = null;
    ParentService.prototype.__cleanUp.call(this);
  };
  
  return DirectoryService;
}

module.exports = createDirectoryService;

var fs = require('fs'),
  Path = require('path');

function createDirectoryService(execlib, ParentServicePack, fileApi){
  'use strict';
  var ParentService = ParentServicePack.Service,
    lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite;

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
    this.set('path',prophash.path);
    this.db = new (fileApi.DataBase)(prophash.path);
  }
  ParentService.inherit(DirectoryService,factoryCreator);
  DirectoryService.prototype.__cleanUp = function(){
    this.db.destroy();
    this.db = null;
    ParentService.prototype.__cleanUp.call(this);
  };
  DirectoryService.prototype.preProcessUserHash = function (userhash) {
    if (userhash) {
      if (lib.isArray(userhash.path)) {
        try {
          userhash.path = Path.join.apply(Path,userhash.path);
          console.log('user path is', userhash.path);
        } catch (e) {
          userhash.path = '.';
        }
      }
      userhash.name = userhash.role+':'+(userhash.path || '.');
    }
  };
  
  return DirectoryService;
}

module.exports = createDirectoryService;

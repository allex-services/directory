var fs = require('fs');

function createDirectoryService(execlib,ParentServicePack){
  'use strict';
  var ParentService = ParentServicePack.Service,
    lib = execlib.lib,
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
    this.state.set('text',prophash.text||false);
    this.parser = require('allex_jsonparser');
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
  DirectoryService.prototype.dataToFile = function(data){
    return this.parser.dataToFile(data);
    //return this.state.get('text') ? new Buffer(JSON.stringify(data,null,2)) : data ;
  };
  DirectoryService.prototype.fileToData = function(chunk){
    return this.parser.fileToData(chunk);
    /*
    if(this.state.get('text')){
      if(chunk.length){
        return JSON.parse(chunk.toString());
      }else{
        return null;
      }
    }else{
      return chunk;
    }
    */
  };
  
  return DirectoryService;
}

module.exports = createDirectoryService;

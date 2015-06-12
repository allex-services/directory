var fs = require('fs'),
    Path = require('path'),
    mkdirp = require('mkdirp');

function createDirectoryService(execlib,ParentServicePack){
  'use strict';
  var ParentService = ParentServicePack.Service,
      lib = execlib.lib;

  function factoryCreator(parentFactory){
    return {
      'service': require('./users/serviceusercreator')(execlib,parentFactory.get('service')),
      'user': require('./users/usercreator')(execlib,parentFactory.get('user')) 
    };
  }

  function satisfyPath(path){
    var p = Path.isAbsolute(path) ? path : Path.join(process.cwd(),path);
    mkdirp(path);
  }

  function DirectoryService(prophash){
    ParentService.call(this,prophash);
    if(!('path' in prophash)){
      throw new lib.Error('propertyhash misses the path field');
    }
    satisfyPath(prophash.path);
    this.state.set('path',prophash.path);
    this.state.set('text',prophash.text||false);
  }
  ParentService.inherit(DirectoryService,factoryCreator);
  DirectoryService.prototype.__cleanUp = function(){
    ParentService.prototype.__cleanUp.call(this);
  };
  DirectoryService.prototype.pathForFilename = function(filename){
    return Path.join(this.state.get('path'),filename);
  };
  DirectoryService.prototype.fileSize = function(filename){
    try{
      var fstats = fs.lstatSync(this.pathForFilename(filename));
      return fstats.size;
    }
    catch(e){
      return 0;
    }
  };
  DirectoryService.prototype.dataToFile = function(data){
    return this.state.get('text') ? new Buffer(JSON.stringify(data,null,2)) : data ;
  };
  DirectoryService.prototype.fileToData = function(chunk){
    if(this.state.get('text')){
      if(chunk.length){
        return JSON.parse(chunk.toString());
      }else{
        return null;
      }
    }else{
      return chunk;
    }
  };
  
  return DirectoryService;
}

module.exports = createDirectoryService;

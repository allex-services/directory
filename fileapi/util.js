var fs = require('fs'),
    Path = require('path'),
    mkdirp = require('mkdirp');

function satisfyPath(path){
  var p = Path.isAbsolute(path) ? path : Path.join(process.cwd(),path);
  mkdirp.sync(path);
}
function pathForFilename(path,filename){
  var ret = Path.join(path,filename);
  satisfyPath(Path.dirname(ret));
  return ret;
}
function typeFromStats(stats){
  if(stats.isFile()){
    return 'f';
  }
  if(stats.isDirectory()){
    return 'd';
  }
  if(stats.isBlockDevice()){
    return 'b';
  }
  if(stats.isCharacterDevice()){
    return 'c';
  }
  if(stats.isSymbolicLink()){
    return 'l';
  }
  if(stats.isSocket()){
    return 's';
  }
  if(stats.isFIFO()){
    return 'n'; //named pipe
  }
}
function fileType(filepath,defer){
  if(defer){
    fs.lstat(filepath,function(err,fstats){
      if(err){
        defer.resolve(0);
      }else{
        defer.resolve(typeFromStats(fstats));
      }
    });
  }else{
    try{
      var fstats = fs.lstatSync(filepath);
      return typeFromStats(fstats);
    }
    catch(e){
      return '';
    }
  }
}
function fileSize(filepath,defer){
  if(defer){
    fs.lstat(filepath,function(err,fstats){
      if(err){
        defer.resolve(0);
      }else{
        defer.resolve(fstats.size);
      }
    });
  }else{
    try{
      var fstats = fs.lstatSync(filepath);
      return fstats.size;
    }
    catch(e){
      return 0;
    }
  }
}

function createUtil(execlib){
  'use strict';
  return {
    satisfyPath: satisfyPath,
    pathForFilename: pathForFilename,
    fileSize: fileSize,
    fileType: fileType,
    typeFromStats: typeFromStats
  };
}

module.exports = createUtil;

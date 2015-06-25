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
function fileSize(filepath){
  try{
    var fstats = fs.lstatSync(filepath);
    return fstats.size;
  }
  catch(e){
    return 0;
  }
}

function createUtil(execlib){
  'use strict';
  return {
    satisfyPath: satisfyPath,
    pathForFilename: pathForFilename,
    fileSize: fileSize
  };
}

module.exports = createUtil;

var fs = require('fs');

function createUser(execlib,ParentUser){
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite;

  if(!ParentUser){
    ParentUser = execSuite.ServicePack.Service.prototype.userFactory.get('user');
  }

  function FileTransmissionServer(user,options){
    ParentUser.prototype.TcpTransmissionServer.call(this,user,options);
    if(!options.filename){
      throw new lib.Error('NO_FILENAME_SPECIFIED_FOR_UPLOAD');
    }
    this.uploadpath = ['uploads',this.options.filename];
    this.file = null;
    this.written = 0;
    this.openFile();
  }
  lib.inherit(FileTransmissionServer,ParentUser.prototype.TcpTransmissionServer);
  FileTransmissionServer.prototype.destroy = function(){
    this.user.__service.state.remove(this.uploadpath);
    this.written = null;
    if(this.file){
      console.log('closing',this.file);
      fs.closeSync(this.file);
    }
    this.file = null;
    this.uploadpath = null;
    ParentUser.prototype.TcpTransmissionServer.prototype.destroy.call(this);
  };
  FileTransmissionServer.prototype.start = function(defer){
    if(!this.file){
      lib.runNext(this.start.bind(this),1000);
    }else{
      ParentUser.prototype.TcpTransmissionServer.prototype.start.call(this,defer);
    }
  };
  FileTransmissionServer.prototype.processTransmissionPacket = function(server,connection,buffer){
    if(!this.file){
      this.closeAllAndDie(server,connection);
    }else{
      this.written += fs.writeSync(this.file,buffer,0,buffer.length);
      this.user.state.set(this.uploadpath,this.written);
    }
  };
  FileTransmissionServer.prototype.openFile = function(){
    if(!this.file){
      try{
        this.file = fs.openSync(this.user.__service.pathForFilename(this.options.filename),'w');
        this.user.set(this.uploadpath,0);
      }catch(e){
        console.log(e);
        //looking for a "too many open files" error to retry
        //lib.runNext(this.openFile.bind(this),1000);
        //otherwise, bail out
        //for now, bail out
        this.destroy();
      }
    }
  };

  function User(prophash){
    ParentUser.call(this,prophash);
    this.waitinguploads = new lib.Map();
  }
  ParentUser.inherit(User,require('../methoddescriptors/user'),[/*visible state fields here*/]/*or a ctor for StateStream filter*/);
  User.prototype.__cleanUp = function(){
    lib.containerDestroyAll(this.waitinguploads);
    this.waitinguploads.destroy();
    this.waitinguploads = null;
    ParentUser.prototype.__cleanUp.call(this);
  };
  User.prototype._waitForUpload = function(options,defer){
    var filename = options.filename;
  };
  User.prototype._checkOnWaitingUploads = function(options,defer){
    var filename = options.filename,
      waitingupload = this.waitinguploads.get(filename),
      e;
    if(waitingupload){
      e = new lib.Error('UPLOAD_ALREADY_ACTIVE','You are already uploading file '+filename);
      e.filename = filename;
      defer.reject(e);
      return true;
    }
  };
  User.prototype._checkOnServiceUploads = function(options,defer){
    var filename = options.filename,
      filesize = options.filesize,
      uploadpath = ['uploads',filename],
      uploadactive = this.__service.state.get(uploadpath),
      und;
    console.log('uploadactive for',uploadpath,':',uploadactive);
    if(uploadactive!==und){
      this.waitinguploads.add(filename,new execSuite.ADS.listenToScalar(uploadpath,{d:this.requestTcpTransmission.bind(this,options,defer)}));
      return true;
    }
    this.__service.state.set(uploadpath,true);
  };
  User.prototype.requestTcpTransmission = function(options,defer){
    if(!options.filename){
      //for now, reject. If DirectoryService User finds out how to 
      //handle other transmission scenarios, continue from here.
      defer.reject(new lib.Error('NO_FILENAME_SPECIFIED_FOR_UPLOAD','filename missing in requestTcpTransmission options'));
      return;
    }
    if(!options.filesize){ //yes, 0 is also invalid...
      defer.reject(new lib.Error('NO_FILESIZE_SPECIFIED_FOR_UPLOAD','filesize missing in requestTcpTransmission options'));
      return;
    }
    if(this._checkOnWaitingUploads(options,defer)){
      return;
    }
    if(this._checkOnServiceUploads(options,defer)){
      return;
    }
    ParentUser.prototype.requestTcpTransmission.call(this,options,defer);
  };
  User.prototype.fetch = function(filename,defer){
    try{
      defer.resolve(
        this.__service.fileToData(
          fs.readFileSync(this.__service.pathForFilename(filename))
        )
      );
    }
    catch(e){
      defer.reject(e);
    }
  };
  User.prototype.write = function(filename,data,defer){
    if(data===null){
      try{
        fs.closeSync(fs.openSync(this.__service.pathForFilename(filename),'w'));
        defer.resolve({filesize:this.__service.fileSize(filename)});
      }
      catch(e){
        console.log(e);
        defer.reject(e);
      }
    }else{
      try{
        fs.writeFileSync(this.__service.pathForFilename(filename),this.__service.dataToFile(data));
        defer.resolve({filesize:this.__service.fileSize(filename)});
      }
      catch(e){
        console.log(e);
        defer.reject(e);
      }
    }
  };
  User.prototype.append = function(filename,data,defer){
    try{
      fs.appendFileSync(this.__service.pathForFilename(filename),this.__service.dataToFile(data));
      defer.resolve({filesize:this.__service.fileSize(filename)});
    }
    catch(e){
      console.log(e);
      defer.reject(e);
    }
  };
  User.prototype.TcpTransmissionServer = FileTransmissionServer;

  return User;
}

module.exports = createUser;

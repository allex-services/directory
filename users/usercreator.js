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
    if (!options.writer) {
      throw new lib.Error('NO_WRITER_READY_FOR_FILE_TRANSMISSION');
    }
    if(!options.filename){
      throw new lib.Error('NO_FILENAME_SPECIFIED_FOR_UPLOAD');
    }
    this.uploadpath = ['uploads',this.options.filename];
    this.written = 0;
    this.options.writer.defer.promise.then(
      this.destroy.bind(this),
      this.destroy.bind(this)
    );
  }
  lib.inherit(FileTransmissionServer,ParentUser.prototype.TcpTransmissionServer);
  FileTransmissionServer.prototype.destroy = function(){
    if(this.uploadpath && this.user && this.user.__service){
      this.user.__service.state.remove(this.uploadpath);
    }
    this.written = null;
    if(this.options){
      this.onTransmissionDone();
      return;
    }
    this.uploadpath = null;
    ParentUser.prototype.TcpTransmissionServer.prototype.destroy.call(this);
  };
  FileTransmissionServer.prototype.processTransmissionPacket = function(server,connection,buffer){
    console.log('processTransmissionPacket',buffer);
    if(!this.options){
      this.closeAllAndDie(server,connection);
    }else{
      this.options.writer.write(buffer).done(this.onPacketWritten.bind(this));
    }
  };
  FileTransmissionServer.prototype.onPacketWritten = function () {
    console.log('packet written', this.options.writer.result);
    this.user.state.set(this.uploadpath, this.options.writer.result);
  };
  FileTransmissionServer.prototype.onTransmissionDone = function(){
    this.options.writer.close();
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
    var writedefer = q.defer();
    this.__service.db.write(options.filename, {}, writedefer).done(
      this.onTransmissionReady.bind(this, options, defer, writedefer),
      defer.reject.bind(defer)
    );
    //ParentUser.prototype.requestTcpTransmission.call(this,options,defer);
  };
  User.prototype.onTransmissionReady = function (options, requestdefer, writedefer, writer) {
    options.writer = writer;
    ParentUser.prototype.requestTcpTransmission.call(this, options, requestdefer);
  };
  User.prototype.fetch = function(filename,parserinfo,defer){
    this.__service.db.read(filename, parserinfo, defer);
  };
  User.prototype.write = function(filename,parserinfo,data,defer){
    if(data===null){
      console.log('Y data null?');
      defer.reject(new lib.Error('WILL_NOT_WRITE_EMPTY_FILE','fs touch not supported'));
      return;
    }
    console.log('write',data);
    this.__service.db.write(filename, parserinfo, defer).then(function(writer){
      console.log('about to write all',data,'to',writer);
      writer.writeAll(data);
    });
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

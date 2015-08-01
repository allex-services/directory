var fs = require('fs');

function createUser(execlib,ParentUser){
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite;

  if(!ParentUser){
    ParentUser = execSuite.ServicePack.Service.prototype.userFactory.get('user');
  }

  function FileUploadServer(user,options){
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
  lib.inherit(FileUploadServer,ParentUser.prototype.TcpTransmissionServer);
  FileUploadServer.prototype.destroy = function(){
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
  FileUploadServer.prototype.processTransmissionPacket = function(server,connection,buffer){
    //console.log('processTransmissionPacket',buffer);
    if(!this.options){
      this.closeAllAndDie(server,connection);
    }else{
      this.options.writer.write(buffer).done(this.onPacketWritten.bind(this));
    }
  };
  FileUploadServer.prototype.onPacketWritten = function () {
    console.log('packet written', this.options.writer.result, 'on', this.uploadpath);
    this.user.state.set(this.uploadpath, this.options.writer.result);
  };
  FileUploadServer.prototype.onTransmissionDone = function(){
    this.options.writer.close();
  };

  function FileDownloadServer(user, options){
    ParentUser.prototype.TcpTransmissionServer.call(this, user, options);
    this.freetowrite = false;
    this.readPromise = true;
    this.q = new lib.Fifo();
  }
  lib.inherit(FileDownloadServer, ParentUser.prototype.TcpTransmissionServer);
  FileDownloadServer.prototype.destroy = function () {
    if(this.readPromise){
      return;
    }
    console.log('my q',this.q);
    if(this.q && this.q.length){
      console.log("Can't die yet,",this.q.length,'items still in q');
      return;
    }
    if(this.freetowrite === null){
      return;
    }
    this.q.destroy();
    this.q = null;
    this.freetowrite = null;
    ParentUser.prototype.TcpTransmissionServer.prototype.destroy.call(this);
  };
  FileDownloadServer.prototype.clearToSend = function (server, connection) {
    if(!this.q){
      return;
    }
    console.log('clearing freetowrite', this.q.length, 'items still in q');
    this.freetowrite = true;
    var next = this.q.pop();
    if(next){
      this.send(server, connection, next);
    }
  };
  FileDownloadServer.prototype.onConnection = function (server, connection) {
    console.log('client connected for download');
    if(this.readPromise && this.readPromise!==true){
      return;
    }
    ParentUser.prototype.TcpTransmissionServer.prototype.onConnection.call(this, server, connection);
    this.readPromise = this.user.__service.db.read(this.options.filename, this.options);
    this.freetowrite = true;
    this.readPromise.done(
      this.readOver.bind(this, server, connection),
      this.readOver.bind(this, server, connection),
      this.sendPacket.bind(this, server, connection)
    );
    console.log('readPromise set');
  };
  FileDownloadServer.prototype.readOver = function (server, connection) {
    this.readPromise = null;
    this.closeAllAndDie(server, connection);
  };
  FileDownloadServer.prototype.sendPacket = function (server, connection, packet) {
    console.log('sendPacket',this,packet);
    if(!this.q){
      console.error('Y ME DED?');
      return;
    }
    if(!this.freetowrite){
      this.q.push(packet);
      return;
    }
    console.log('should send',packet,'on download');
    this.freetowrite = connection.write(packet, this.clearToSend.bind(this, server, connection));
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
  User.prototype.requestTcpTransmission = function (options, defer) {
    if (options.download){
      this.requestDownload(options,defer);
    }else{
      this.requestUpload(options,defer);
    }
  };
  User.prototype.requestUpload = function (options, defer) {
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
      this.onUploadReady.bind(this, options, defer, writedefer),
      defer.reject.bind(defer)
    );
    //ParentUser.prototype.requestTcpTransmission.call(this,options,defer);
  };
  User.prototype.onUploadReady = function (options, requestdefer, writedefer, writer) {
    requestdefer.notify(options.filename);
    options.writer = writer;
    options.serverCtor = FileUploadServer;
    ParentUser.prototype.requestTcpTransmission.call(this, options, requestdefer);
  };
  User.prototype.requestDownload = function (options, defer) {
    if(!options.filename){
      //for now, reject. If DirectoryService User finds out how to 
      //handle other transmission scenarios, continue from here.
      defer.reject(new lib.Error('NO_FILENAME_SPECIFIED_FOR_DOWNLOAD','filename missing in requestTcpTransmission options'));
      return;
    }
    options.serverCtor = FileDownloadServer;
    options.raw = true;
    ParentUser.prototype.requestTcpTransmission.call(this, options, defer);
  };
  User.prototype.fetch = function (filename, options, defer) {
    this.__service.db.read(filename, options, defer);
  };
  User.prototype.write = function (filename, parserinfo, data, defer) {
    if(data===null){
      console.log('Y data null?');
      defer.reject(new lib.Error('WILL_NOT_WRITE_EMPTY_FILE','fs touch not supported'));
      return;
    }
    this.__service.db.write(filename, parserinfo, defer).then(function(writer){
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
  User.prototype.traverse = function (dirname, options, defer) {
    options.traverse = true;
    this.__service.db.read(dirname, options, defer);
  };

  return User;
}

module.exports = createUser;

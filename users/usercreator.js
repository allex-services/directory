var fs = require('fs'),
  Path = require('path');

function createUser(execlib,ParentUser){
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite,
    UserSession,
    Channel;

  if(!ParentUser){
    ParentUser = execSuite.ServicePack.Service.prototype.userFactory.get('user');
  }

  UserSession = ParentUser.prototype.getSessionCtor('.');
  Channel = UserSession.Channel;

  function DirectoryChannel(usersession) {
    Channel.call(this, usersession);
  }
  lib.inherit(DirectoryChannel, Channel);
  DirectoryChannel.prototype.name = 'fs';

  function DirectorySession(user, session, gate) {
    UserSession.call(this, user, session, gate);
    this.addChannel(DirectoryChannel);
  }
  UserSession.inherit(DirectorySession);
  DirectorySession.Channel = DirectoryChannel;

  function FileUploadServer(user,options){
    ParentUser.prototype.TcpTransmissionServer.call(this,user,options);
    if (!options.txn) {
      throw new lib.Error('NO_DIRECTORY_TRANSACTION_READY_FOR_FILE_TRANSMISSION');
    }
    if (!options.writer) {
      throw new lib.Error('NO_WRITER_READY_FOR_FILE_TRANSMISSION');
    }
    if(!options.filename){
      throw new lib.Error('NO_FILENAME_SPECIFIED_FOR_UPLOAD');
    }
    this.uploadpath = ['uploads',this.options.filename];
    this.written = 0;
    this.options.writer.defer.promise.then(
      this.onSuccess.bind(this, options.txn),
      this.onFailure.bind(this, options.txn)
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
  FileUploadServer.prototype.onSuccess = function (txn) {
    var d = q.defer();
    txn.commit(d);
    d.promise.done(this.onSuccessDone.bind(this));
  };
  FileUploadServer.prototype.onFailure = function (txn) {
    var d = q.defer();
    txn.commit(d);
    d.promise.done(this.onFailureDone.bind(this));
  };
  FileUploadServer.prototype.onSuccessDone = function () {
    this.user.state.set(this.uploadpath, '*');
    this.destroy();
  };
  FileUploadServer.prototype.onFailureDone = function () {
    this.user.state.set(this.uploadpath, '!');
    this.destroy();
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
    //console.log('packet written', this.options.writer.result, 'on', this.uploadpath);
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
    //console.log('my q',this.q);
    if(this.q && this.q.length){
      //console.log("Can't die yet,",this.q.length,'items still in q');
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
    //console.log('clearing freetowrite', this.q.length, 'items still in q');
    this.freetowrite = true;
    var next = this.q.pop();
    if(next){
      this.send(server, connection, next);
    }
  };
  FileDownloadServer.prototype.onConnection = function (server, connection) {
    //console.log('client connected for download');
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
    //console.log('readPromise set');
  };
  FileDownloadServer.prototype.readOver = function (server, connection) {
    this.readPromise = null;
    this.closeAllAndDie(server, connection);
  };
  FileDownloadServer.prototype.sendPacket = function (server, connection, packet) {
    //console.log('sendPacket',this,packet);
    if(!this.q){
      console.error('Y ME DED?');
      return;
    }
    if(!this.freetowrite){
      this.q.push(packet);
      return;
    }
    //console.log('should send',packet,'on download');
    this.freetowrite = connection.write(packet, this.clearToSend.bind(this, server, connection));
  };


  function User(prophash){
    ParentUser.call(this,prophash);
    this.path = prophash.path;
    this.traversaloptions = prophash.traversal;
    this.waitinguploads = new lib.Map();
    this.fsEventListener = this.__service.db.changed.attach(this.onFSEvent.bind(this));
  }
  ParentUser.inherit(User,require('../methoddescriptors/user'),[/*visible state fields here*/]/*or a ctor for StateStream filter*/);
  User.prototype.__cleanUp = function(){
    if (!this.fsEventListener) {
      return;
    }
    this.fsEventListener.destroy();
    this.fsEventListener = null;
    lib.containerDestroyAll(this.waitinguploads);
    this.waitinguploads.destroy();
    this.waitinguploads = null;
    this.traversaloptions = null;
    this.path = null;
    ParentUser.prototype.__cleanUp.call(this);
  };
  User.prototype.onFSEvent = function (path, originalfs, newfs) {
    var pi;
    if (this.path) {
      pi = path.indexOf(this.path);
      if (pi===0){
        this.broadcastFSEvent(path.substring(pi), originalfs, newfs);
      } else {
        //console.log('my path', this.path, 'is not a start of', path);
      }
    } else {
      this.broadcastFSEvent(path, originalfs, newfs);
    }
  };
  User.prototype.broadcastFSEvent = function (path, originalfs, newfs) {
    var fseobj = {p:path, o: originalfs, n: newfs};
    this.sessions.traverse(function(s){
      s.channels.get('fs').onStream(fseobj);
    });
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
    //console.log('uploadactive for',uploadpath,':',uploadactive);
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
    var txn, metauploadpath, writemetadatadefer;
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
    if (options.metadata) {
      txn = this.__service.db.begin(Path.dirname(options.filename));
      metauploadpath = this.metaPath(options.filename);
      writemetadatadefer = q.defer();
      //console.log('metauploadpath', metauploadpath);
      this.writeOnDB(txn, metauploadpath, {modulename: 'allex_jsonparser'}, options.metadata, writemetadatadefer);
      writemetadatadefer.promise.done(
        this.realizeUploadRequest.bind(this, txn, options, defer),
        defer.reject.bind(defer)
      );
    } else {
      this.realizeUploadRequest(txn, options, defer);
    }
  };
  User.prototype.realizeUploadRequest = function (txn, options, defer) {
    if(this._checkOnWaitingUploads(options,defer)){
      return;
    }
    if(this._checkOnServiceUploads(options,defer)){
      return;
    }
    txn.write(options.filename, {}, q.defer()).done( //anonymous defer here will later be found in writer.defer
      this.onUploadReady.bind(this, txn, options, defer),
      defer.reject.bind(defer)
    );
  };
  User.prototype.onUploadReady = function (txn, options, requestdefer, writer) {
    //console.log('onUploadReady', options);
    requestdefer.notify(options.filename);
    options.txn = txn;
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
    this.writeOnDB(this.__service.db, filename, parserinfo, data, defer);
  };
  User.prototype.writeOnDB = function (db, filename, parserinfo, data, defer) {
    if(data===null){
      console.log('Y data null?');
      defer.reject(new lib.Error('WILL_NOT_WRITE_EMPTY_FILE','fs touch not supported'));
      return;
    }
    db.write(filename, parserinfo, defer).then(function(writer){
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
    var opts = lib.extend({}, this.traversaloptions);
    lib.extend (opts, options);
    opts.traverse = true;
    //console.log('my opts', this.traversaloptions, '+ particular opts', options, '=>', opts);
    this.__service.db.read(this.path ? Path.join(this.path, dirname) : dirname, opts, defer);
  };
  User.prototype.notifyFSEvent = function (originalfs, newfs, path) {
  };
  User.prototype.metaPath = function (filepath) {
    return Path.join(Path.dirname(filepath),'.meta',Path.basename(filepath));
  };
  User.prototype.getSessionCtor = execSuite.userSessionFactoryCreator(DirectorySession);

  return User;
}

module.exports = createUser;

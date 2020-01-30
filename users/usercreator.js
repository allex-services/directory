var fs = require('fs'),
  Path = require('path');

function createUser(execlib,ParentUser){
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
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
    this.filenames = [];
  }
  UserSession.inherit(DirectorySession, {
    beginFileUpload: [{
      title: 'File Name', 
      type: 'string'
    },{
      title: 'File Size',
      type: 'number'
    },{
      title: 'No Transaction',
      type: 'bool'
    },{
      title: 'Metadata',
      type: ['null', 'object']
    }],
    uploadFileChunk: [{
      title: 'File Name', 
      type: 'string'
    },{
      title: 'Transaction ID', 
      type: 'string'
    },{
      title: 'File Chunk',
      type: 'object'
    }],
    finishFileUpload: [{
      title: 'File Name',
      type: 'string'
    },{
      title: 'Transaction ID', 
      type: 'string'
    }]
  });
  DirectorySession.prototype.__cleanUp = function () {
    UserSession.prototype.__cleanUp.call(this);
  };
  DirectorySession.prototype.startTheDyingProcedure = function () {
    if (this.filenames) {
      this.filenames.forEach(this.user.__service.abortFileTransmission.bind(this.user.__service));
    }
    this.filenames = null;
    return UserSession.prototype.startTheDyingProcedure.call(this);
  };
  DirectorySession.prototype.beginFileUpload = function (filename, filesize, notransaction, metadata, defer) {
    var b = this.user.__service.newUpload(filename, filesize, notransaction, metadata);
    b.then(this.filenames.push.bind(this.filenames, filename));
    qlib.promise2defer(b, defer);
  };
  DirectorySession.prototype.uploadFileChunk = function (filename, txid, chunk, defer) {
    qlib.promise2defer(this.user.__service.uploadChunk(filename, txid, chunk), defer);
  };
  DirectorySession.prototype.finishFileUpload = function (filename, txid, defer) {
    var rm = this.forgetFilename.bind(this, filename), ffu;
    ffu = this.user.__service.finishFileUpload(filename, txid);
    ffu.then(rm, rm);
    qlib.promise2defer(ffu, defer);
    filename = null;
  };
  DirectorySession.prototype.forgetFilename = function (filename) {
    var ind;
    if (!lib.isArray(this.filenames)) {
      filename = null;
      return;
    }
    ind = this.filenames.indexOf(filename);
    if (ind>=0) {
      this.filenames.splice(ind,1);
    }
    filename = null;
  };
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
    if (this.options && this.written !== -this.options.filesize) {
      return;
    }
    if(this.uploadpath && this.user && this.user.__service){
      this.user.__service.state.remove(this.uploadpath);
    }
    this.uploadpath = null;
    this.written = null;
    ParentUser.prototype.TcpTransmissionServer.prototype.destroy.call(this);
  };
  FileUploadServer.prototype.onSuccess = function (txn, result) {
    //console.log('onSuccess', result);
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
    if (!this.user) {
      console.error('How come FileUploadServer has no user?', this);
      return;
    }
    //console.log('setting', this.uploadpath, 'to *');
    this.user.set(this.uploadpath, '*');
    this.written = -this.written;
    this.destroy();
  };
  FileUploadServer.prototype.onFailureDone = function () {
    this.user.set(this.uploadpath, '!');
    this.options = null;
    this.destroy();
  };
  FileUploadServer.prototype.processTransmissionPacket = function(server,connection,buffer){
    if(!this.options){
      this.closeBoth(server,connection);
    }else{
      this.options.writer.write(buffer).done(this.onPacketWritten.bind(this));
    }
  };
  FileUploadServer.prototype.onPacketWritten = function (bytes) {
    //console.log('packet written', this.options.writer.result, 'on', this.uploadpath);
    this.written += bytes;
    this.user.set(this.uploadpath, this.written);
    //console.log('updating', this.uploadpath, 'to', this.user.get(this.uploadpath));
    if (this.written === this.options.filesize) {
      //console.log('FileUploadServer closing writer');
      this.options.writer.close();
    } /*else {
      console.log('FileUploadServer not closing writer because', this.written, '!=', this.options.filesize);
    }*/
  };

  function FileDownloadServer(user, options){
    ParentUser.prototype.TcpTransmissionServer.call(this, user, options);
    this.freetowrite = false;
    this.reader = null;
    this.q = new lib.Fifo();
  }
  lib.inherit(FileDownloadServer, ParentUser.prototype.TcpTransmissionServer);
  FileDownloadServer.prototype.destroy = function () {
    if(this.reader){
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
      this.sendPacket(server, connection, next);
    }
    this.reader.step();
  };
  FileDownloadServer.prototype.onAuthenticatedConnection = function (server, connection) {
    //console.log('client connected for download');
    if(this.reader){
      return;
    }
    ParentUser.prototype.TcpTransmissionServer.prototype.onAuthenticatedConnection.call(this, server, connection);
    this.reader = this.user.__service.db.stepread(this.options.filename, this.options);
    this.freetowrite = true;
    this.reader.defer.promise.done(
      this.readOver.bind(this, server, connection),
      this.readOver.bind(this, server, connection),
      this.sendPacket.bind(this, server, connection)
    );
  };
  FileDownloadServer.prototype.readOver = function (server, connection) {
    this.reader = null;
    this.closeBoth(server, connection);
  };
  FileDownloadServer.prototype.sendPacket = function (server, connection, packet) {
    //console.log('sendPacket',this,packet);
    //console.log('sending packet', packet.length);
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
  ParentUser.inherit(User,require('../methoddescriptors/user'),[/*visible state fields here*/['uploads', null]]/*or a ctor for StateStream filter*/);
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
    if(uploadactive!==und){
      this.waitinguploads.add(filename,new execSuite.ADS.listenToScalar(uploadpath,{d:this.requestTcpTransmission.bind(this,options,defer)}));
      return true;
    }
    this.__service.set(uploadpath,true);
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
    txn = options.notransaction ? 
      this.__service.db
      :
      this.__service.db.begin(Path.dirname(options.filename));
    if (options.metadata) {
      txn.writeFileMeta(options.filename, options.metadata).done(
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
  User.prototype.write = function (filename, options, data, defer) {
    this.__service.db.writeToFileName(filename, options, data, defer);
  };
  User.prototype.append = function(filename, options, data, defer){
    options.append = true;
    this.__service.db.writeToFileName(filename, options, data, defer);
    /*
    try{
      fs.appendFileSync(this.__service.pathForFilename(filename),this.__service.dataToFile(data));
      defer.resolve({filesize:this.__service.fileSize(filename)});
    }
    catch(e){
      console.log(e);
      defer.reject(e);
    }
    */
  };
  /*
  var util = require('util');
  function expose(obj){
    return util.inspect(obj, {depth:null});
  }
  */
  User.prototype.traverse = function (dirname, options, defer) {
    var opts = lib.extend({}, this.traversaloptions);
    //console.log(this.path, 'my opts', expose(this.traversaloptions), '+ particular opts', expose(options), '=>', expose(opts));
    lib.extend (opts, options);
    opts.traverse = true;
    //console.log(this.path, 'my opts', expose(this.traversaloptions), '+ particular opts', expose(options), '=>', expose(opts));
    this.__service.db.read(this.path ? Path.join(this.path, dirname) : dirname, opts, defer);
  };
  User.prototype.notifyFSEvent = function (originalfs, newfs, path) {
  };
  User.prototype.getSessionCtor = execSuite.userSessionFactoryCreator(DirectorySession);

  return User;
}

module.exports = createUser;

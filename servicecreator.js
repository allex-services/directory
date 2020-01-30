var fs = require('fs'),
  Path = require('path');

function createDirectoryService(execlib, ParentService, fileApi){
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
    execSuite = execlib.execSuite,
    jobs = require('./jobs')(lib);


  function factoryCreator(parentFactory){
    return {
      'service': require('./users/serviceusercreator')(execlib,parentFactory.get('service')),
      'user': require('./users/usercreator')(execlib,parentFactory.get('user')) 
    };
  }

  function liveRejecter (job) {
    job.reject(new lib.Error('SERVICE_DYING', 'The DirectoryService is dying'));
  }
  function LiveFiles () {
    lib.Map.call(this);
  }
  lib.inherit(LiveFiles, lib.Map);
  LiveFiles.prototype.destroy = function () {
    this.traverse(liveRejecter);
    lib.Map.prototype.destroy.call(this);
  };
  LiveFiles.prototype.monitor = function (name, job, promise) {
    var d = q.defer(),
      ret = d.promise;
    promise.then(
      null,
      d.reject.bind(d),
      this.onJobActivated.bind(this, d, promise, name, job)
    );
    d = null;
    name = null;
    job = null;
    promise = null;
    return ret;
  };
  LiveFiles.prototype.onJobActivated = function (defer, promise, name, job, id) {
    var r = this.remove.bind(this, name);
    this.add(name, job);
    promise.then(r, r);
    defer.resolve(id);
  };

  function DirectoryService(prophash){
    ParentService.call(this,prophash);
    if(!('path' in prophash)){
      throw new lib.Error('NO_PATH', 'No "path" field in propertyhash');
    }
    fileApi.util.satisfyPath(prophash.path);
    this.set('path',prophash.path);
    this.db = new (fileApi.DataBase)(prophash.path);
    this.jobs = new qlib.JobCollection();
    this.liveFiles = new LiveFiles();
  }
  ParentService.inherit(DirectoryService,factoryCreator);
  DirectoryService.prototype.__cleanUp = function(){
    if (this.liveFiles) {
      this.liveFiles.destroy();
    }
    this.liveFiles = null;
    if (this.jobs) {
      this.jobs.destroy();
    }
    this.jobs = null;
    this.db.destroy();
    this.db = null;
    ParentService.prototype.__cleanUp.call(this);
  };
  DirectoryService.prototype.newUpload = function (filename, filesize, notransaction, metadata) {
    var job = new jobs.UploadJob(this, filename, filesize, notransaction, metadata),
      p = this.jobs.run(filename, job);
    return this.liveFiles.monitor(filename, job, p);
  };
  DirectoryService.prototype.uploadChunk = function (filename, txid, chunk) {
    var job = this.liveFiles.get(filename);
    if (!job) {
      return q.reject(new lib.Error('NO_ACTIVE_UPLOAD', filename));
    }
    if (job.id !== txid) {
      return q.reject(new lib.Error('UPLOAD_ID_MISMATCH', txid));
    }
    return job.takeChunk(chunk);
  };
  DirectoryService.prototype.finishFileUpload = function (filename, txid) {
    var job = this.liveFiles.get(filename);
    if (!job) {
      return q.reject(new lib.Error('NO_ACTIVE_UPLOAD', filename));
    }
    if (job.id !== txid) {
      return q.reject(new lib.Error('UPLOAD_ID_MISMATCH', txid));
    }
    return job.finish();
  };
  DirectoryService.prototype.abortFileTransmission = function (filename) {
    var job = this.liveFiles.get(filename);
    if (job) {
      job.reject(new lib.Error('USER_SESSION_DYING', 'Aborted due to User Session being destroyed'));
    }
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

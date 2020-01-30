function upload (sink, filename, remotefilename) {
  var d = q.defer(), ret = d.promise;
  taskRegistry.run('transmitFile', {
    sink: sink,
    filename: filename,
    remotefilename: remotefilename||filename,
    cb: d.resolve.bind(d),
    errorcb: d.reject.bind(d)
  });
  d = null;
  return ret;
}

function errorer (title, reason) {
  console.error(title, reason);
  title = null;
  throw reason;
}

function uploader (sink, filename, remotefilename, times, result) {
  if (!times) {
    return result;
  }
  return upload(sink, filename, remotefilename).then(
      uploader.bind(null, sink, filename, remotefilename, times-1)//,
      //errorer.bind(null, 'Error in uploading '+filename+' as '+remotefilename)
  );
  sink = null;
  filename = null;
  remotefilename = null;
  times = null;
}

describe ('Test Upload', function () {
  it('Create a Directory Service', function () {
    this.timeout(1e5);
    return setGlobal('FilesService', startService({
      instancename: 'Files', 
      modulename: 'allex_directoryservice', 
      propertyhash: {path: 'files'}
    }));
  });
  it('Connect as "user"', function () {
    return setGlobal('Files', FilesService.subConnect('.', {name: 'user', role: 'user'}));
  });
  it('Upload', function () {
    this.timeout(1e8);
    return upload(Files, 'blah.txt', 'njah.txt');
  });
  it('Upload again', function () {
    this.timeout(1e8);
    return upload(Files, 'blah.txt');
  });
  it('Upload clonex2', function () {
    this.timeout(1e8);
    return q.all([
      qlib.promise2console(upload(Files, 'blah.txt'), '1st'),
      qlib.promise2console(upload(Files, 'blah.txt'), '2nd')
    ]);
  });
  it('Upload clonex10x5', function () {
    this.timeout(1e9);
    var promises = [];
    for (var i=0; i<100; i++) {
      promises.push(qlib.promise2console(uploader(Files, 'blah.txt', null, 30), 'Upload #'+i));
    }
    return q.all(promises);
  });
  it('Destroy sinks', function () {
    Files.destroy();
    FilesService.destroy();
  });
});

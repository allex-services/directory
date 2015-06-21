module.exports = {
  fetch: [{
    title: 'filename',
    type: 'string'
  },{
    title: 'parser info hash (modulename,propertyhash)',
    type: 'object'
  }],
  write: [{
    title: 'filename',
    type: 'string'
  },{
    title: 'parser info hash (modulename,propertyhash)',
    type: 'object'
  },
  true
  ],
  append: [{
    title: 'filename',
    type: 'string'
  },{
    title: 'parser info hash (modulename,propertyhash)',
    type: 'object'
  },
  true
  ]
};

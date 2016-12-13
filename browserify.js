ALLEX.execSuite.registry.registerClientSide('allex_directoryservice',require('./sinkmapcreator')(ALLEX, ALLEX.execSuite.registry.getClientSide('.')));
ALLEX.execSuite.taskRegistry.registerClientSide('allex_directoryservice',require('./taskcreator')(ALLEX, ALLEX.execSuite.libRegistry.get('allex_directorylib')));

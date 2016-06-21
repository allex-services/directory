ALLEX.execSuite.registry.register('allex_directoryservice',require('./sinkmapcreator')(ALLEX, ALLEX.execSuite.registry.getClientSide('.')));
ALLEX.execSuite.taskRegistry.register('allex_directoryservice',require('./taskcreator')(ALLEX, ALLEX.execSuite.libRegistry.get('allex_directorylib')));

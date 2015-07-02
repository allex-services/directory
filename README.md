# DirectoryService
AllexJS service that takes care of a given directory.

## `path`
The path to the directory __must__ be given in the propertyhash for the
constructor, or the constructor will `throw` an error.

The path may be:
- relative (to the current working directory of the running `allexmaster`, that
is the directory where `allexmaster.pid` resides)
- absolute (to the root of the file system)

The directory will be:
- opened if it exists
- created if it doesn't exist

## File operations
These are:
- read
- write
- append

### File paths
For any operation, a path to the file must be given.

The path to the file will __always__ be treated __relative__ to the directory's
path.

### File operation modes
File operations may be done in
- raw mode
- parse mode

## Writing to files
When smaller data chunks have to be written to file, use the `writeToFile` task
provided by the `DirectoryService`.

For large data payloads, use the 'transmitFile' task provided by the
`DirectoryService`.

## Reading files
For smaller files (or smaller payloads, like "_record by record_" mode), use the
'readFile' task provided by the `DirectoryService`.

For larger files, use the 'downloadFile' task provided by the `DirectoryService`.
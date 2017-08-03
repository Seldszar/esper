# Esper

> Another tool for exporting animated units from *Final Fantasy: Brave Exvius*.

## Pre-requisites

Before using this tool, you must have the various *Final Fantasy: Brave Exvius* data files.
You can find them on Internet or [dump the cache files to your PC](https://exvius.gamepedia.com/How_to_data_mine).

## Usage

```bash
# Extract the idle animation of a single unit
$ esper -u XXXXXXXXXX -a idle units/ animated/

# Extract the idle & atk animations of a single unit
$ esper -u XXXXXXXXXX -a idle,atk units/ animated/

# Extract the idle animations of multiple units
$ esper -u XXXXXXXXXX,YYYYYYYYYY -a idle units/ animated/
```

## License

[MIT](https://gitlab.com/seldszar/taxon/blob/master/LICENSE)

## RTHawk Application - Magnetization Transfer Saturation

## Required configurations 

No special configuration is required. 

## Steps 

1. Clone this repository to the `HeartVista/Applications` directory
2. Create the following folders and subfolders under `HeartVista/Storage` directory
```
├── /RawImage
    └── /qMRLabAcq  
        ├── /rthRecon
        └── /rthRaw 
```
3. Add `MTSAT` to a protocol
4. Connect RTHawk to the scanner as usual 
5. Start the scan. It will iterate over neccesary acquisitions. 

## BIDS panel 

You can define `subject`, `session` and `acquisition` BIDS values for a scan. Note that output data (`*.dat`) will be saved in [BIDS compatible file names and metadata fields](https://bids-specification.readthedocs.io/en/latest/99-appendices/10-file-collections.html). Please make sure that you provide a unique subject/session ID per scan. 

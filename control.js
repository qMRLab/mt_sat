/*
================== qMRLab vfa_t1 pulse sequence = 
This is the controller script which is responsible for 
passing the variables between the GUI (control.ui) and 
RTHawk's sequencing engine.    

Waveforms exported by SpinBench and described by application.apd
determine the initial state of the sequence. For this 
application, initial parameters are fetched from: 

- [excitation] SincRF + Z (SlabSelect.spv)
- [echodelay] in us, to be exposed to GUI. (Not linked to a file)
- [readout] 3D Cartesian Readout (CartesianReadout3D.spv)
- [spoiler] Area Trapezoid  (SpoilerGradient.spv)

Author:  Agah Karakuzu agahkarakuzu@gmail.com
Created: October, 2019. 
// =================================================
*/

// Get sequence ID
var sequenceId  = rth.sequenceId();

// Fetch initial parameters described in CartesianReadout3D.spv 
var xPixels = SB.readout["<Cartesian Readout>.xRes"]; // Number of samples, no need for this, acquisition emits this. 
var phaseEncodes = SB.readout["<Cartesian Readout>.yRes"]; // Number of repeats 
var zPartitions = SB.readout["<Phase Encode Gradient>.res"]; // Number of partitions (has attr fov as well)

// Disable at the beginning so that they do not determine minimum TR
// This part is a bit tricky, if you enable 1200 here by default, the minimum TR
// at the beginning of the app will assume MTC on, then T1w won't be able to set 
// a shorter TR or min TR for MT and PD will be longer than what you want.
rth.addCommand(new RthUpdateEnableBlockCommand(sequenceId, "mt1200", false));
rth.addCommand(new RthUpdateEnableBlockCommand(sequenceId, "mt2000", false));

// These values are changed in the SB only.
rth.addCommand(new RthUpdateChangeReconstructionParameterCommand(sequenceId, {
  phaseEncodes: phaseEncodes,
  zPartitions: zPartitions
}));

var instanceName = rth.instanceName();

// Get the sequence parameters from the sequencer.
var scannerParameters = new RthUpdateGetParametersCommand(sequenceId);
rth.addCommand(scannerParameters);
var parameterList = scannerParameters.receivedData();



rth.addSeriesDescription(instanceName);

rth.informationInsert(sequenceId, "mri.SequenceName", "qMRLab " + instanceName);
rth.informationInsert(sequenceId, "mri.ScanningSequence", "GR");
rth.informationInsert(sequenceId, "mri.SequenceVariant", "SS, SP");
rth.informationInsert(sequenceId, "mri.ScanOptions", "");
rth.informationInsert(sequenceId, "mri.MRAcquisitionType", "3D");
rth.informationInsert(sequenceId, "mri.NumberOfAverages", 1);
rth.informationInsert(sequenceId, "mri.NumberOfCoils", parameterList[2]);
rth.informationInsert(sequenceId, "mri.EchoTrainLength", 1);
rth.informationInsert(sequenceId, "mri.ExcitationTimeBandwidth",SB.excitation["<Sinc RF>.timeBandwidth"]);
rth.informationInsert(sequenceId, "mri.ExcitationDuration",SB.excitation["<Sinc RF>.duration"]);
rth.informationInsert(sequenceId, "mri.ExcitationType","SINC Hamming");

// Get minimum TR
var scannerTR = new RthUpdateGetTRCommand(sequenceId, [], []);
rth.addCommand(scannerTR);
var minTR = scannerTR.tr();
var startingTR = minTR;
RTHLOGGER_WARNING("MTSAT Minimum TR: " + minTR);

// Starting FOV also depends on CartesianReadout3D.spv
// In SpinBench, FOV is defined in cm. xFOV = yFOV always. 
var startingFOV = SB.readout["<Cartesian Readout>.fov"]; // cm
var startingZFOV = SB.readout["<Phase Encode Gradient>.fov"]*10; //mm

// Slice thickness depends on SlabSelect.spv
// In SpinBench, SliceThickness is defined in mm.
// RF pulse is associated with the gradient. Changes in SSG updates RF as well. 
var startingThickness = SB.excitation["<Slice Select Gradient>.thickness"]; // mm
// Insert metadata
rth.informationInsert(sequenceId,"mri.SliceThickness",startingZFOV/zPartitions);
rth.informationInsert(sequenceId,"mri.ExcitationSlabThickness",startingZFOV);
var startingResolution = startingFOV/xPixels* 10; // mm

rth.informationInsert(sequenceId,"mri.VoxelSpacing",[startingResolution*10,startingResolution*10,startingZFOV/zPartitions]);
// Specify TE delay interval 
var minTE = SB.excitation['<Sinc RF>.end'] - SB.excitation['<Sinc RF>.peak'] + SB.readout['<Cartesian Readout>.readoutCenter'];
var startingTE = minTE + rth.apdKey("echodelay/duration")/1000; //ms
rth.informationInsert(sequenceId,"mri.EchoTime",startingTE);

// Assume FA from SB as the smaller.
var startingFA2 = SB.excitation["<Sinc RF>.tip"]; //20
// FA should be in decreasing order (FA1 > FA2)
var startingFA1 = startingFA2 - 14;

// To store the current values 
var sliceThickness = startingThickness;
var encodedThickness = startingZFOV;
var fieldOfView = startingFOV;

//FIXME: This is temporary. Fix the order
var flipAngle1 = startingFA2; // large (20 init)
var flipAngle2 = startingFA1; // small (6 init)

var echoTime = startingTE;
var repetitionTime = startingTR;

// Import display tool

rth.importJS("lib:RthDisplayThreePlaneTools.js");
var displayTools = new RthDisplayThreePlaneTools();

// This is the encoded area (larger than excited slab)
// TODO: Change variable names and manage these guys later on.
//displayTools.setSliceThickness(startingZFOV) //mm

function changeFOV(fov){
  if (fov<startingFOV) fov = startingFOV; 
  var scale = startingFOV/fov;
  // Scale gradients (x,y,z) assuming in-plane isometry
  rth.addCommand(new RthUpdateScaleGradientsCommand(sequenceId,"readout",scale,scale, startingZFOV/encodedThickness));
  // Waveforms are not affected by the below: 
  rth.addCommand(new RthUpdateChangeResolutionCommand(sequenceId,startingResolution/scale));
  rth.addCommand(new RthUpdateChangeFieldOfViewCommand(sequenceId, fov*10,fov*10,startingThickness));
  // Annotation
  displayTools.setFOV(fov * 10); //mm
  //displayTool.setResolution(startingResolution/scale,startingResolution/scale);
  // Update
  fieldOfView = fov;
}



function changeSliceThickness(encodedZ){
  // The value user provides interacts with the ZFOV. The ratio between 
  // Encoded and the Excited slab is 0.8. So whatever ZFOV user selects, 
  // that*0.83 will be the new excited slab thickness. 

  if (encodedZ < startingZFOV) encodedZ = startingZFOV;
  
  var encFactor = 50/60;
  // Scale SS gradient
  // The scaling is always performed with respect to the STARTING VALUE (1). Factors must be always smaller than 1.

  rth.addCommand(new RthUpdateFloatParameterCommand(sequenceId,"excitation","scaleGradients","",startingThickness/(encodedZ*encFactor)));

  // If the slice thickness is increased, so should the zFOV (by scaling down z-grad)
  rth.addCommand(new RthUpdateScaleGradientsCommand(sequenceId,"readout",startingFOV/fieldOfView,startingFOV/fieldOfView,startingZFOV/encodedZ));

  // Update slice prescription UI tools (the green lines in the UI)
  // Semantics: In 3D this is actually "SLAB THICKNESS" the following updates prescription, so that we see the proper scaling.
  displayTools.setSliceThickness(encodedZ);
  
  // Update metadata.
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,{
    SliceThickness:encodedZ/zPartitions,
    VoxelSpacing: [fieldOfView/xPixels*10,fieldOfView/phaseEncodes*10,encodedZ/zPartitions]
  }));

  rth.addCommand(new RthUpdateChangeFieldOfViewCommand(sequenceId, fieldOfView*10,fieldOfView*10,encodedZ));

  encodedThickness = encodedZ;

}

// TODO: UPDATE WITH LOOP COMMANDS
// TODO: UPDATE WITH LOOP COMMANDS TRT1 too!!
function changeTR(tr) {
  if (tr < minTR) {
    tr = minTR;
  }
  // TR is a generic integer parameter, so to be updated by RthUpdateIntParameterCommand
  // Method name is given by "setDesiredTR", defined in microseconds!

  var value = tr * 1000; // Convert from milisec to microsec
  //var trCommand = new RthUpdateIntParameterCommand(sequenceId, "", "setDesiredTR", "", value);
  //mtsLoopCommands(value,TRT1,offsetIndex)
  //rth.addCommand(trCommand);
  //rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId, "RepetitionTime", tr));

  repetitionTime = tr;

}

// TODO: UPDATE WITH LOOP COMMANDS
function changeFlipAngle1(angle1) {
  //var flipCommand = RthUpdateFloatParameterCommand(sequenceId, "sequence", "scaleRF", "", angle / startingFA1);
  //rth.addCommand(flipCommand);
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId, "FlipAngle1", angle1));

  flipAngle1 = angle1;
}

// TODO: UPDATE WITH LOOP COMMANDS
function changeFlipAngle2(angle2){
  // Just referencing global var here.
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId, "FlipAngle2", angle2));

  flipAngle2 = angle2;
}

function changeTE(te)
{
  
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId, "EchoTime", te));
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId, "EchoTime", te));

  var echoDelay = (te - minTE) * 1000; // Convert to usec
  rth.addCommand(new RthUpdateIntParameterCommand(sequenceId, "echodelay", "setDelay", "", echoDelay));
  
}


/* Define UI element settings and link outputs from change events to the respective vars
  inputWidget_FOV (Done)
  inputWidget_SliceThickness (Done)
  inputWidget_FA1 (Done)
  inputWidget_FA2 (Done)
  inputWidget_TR  (Done)
*/

// Send metadata to recon
rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,{
  ExcitationTimeBandwidth: SB.excitation["<Sinc RF>.timeBandwidth"],
  ExcitationDuration: SB.excitation["<Sinc RF>.duration"],
  NumberOfCoils: parameterList[2],
  FlipAngle1:flipAngle1,
  FlipAngle2: flipAngle2,
  FlipIndex: "on",
  PreAcqDuration: SB.readout["<Preacquisitions>.duration"]
}));


controlWidget.inputWidget_SliceThickness.minimum = startingZFOV;
controlWidget.inputWidget_SliceThickness.maximum = startingZFOV*2;
controlWidget.inputWidget_SliceThickness.value   = startingZFOV;

controlWidget.inputWidget_FOV.minimum = startingFOV;
controlWidget.inputWidget_FOV.maximum = startingFOV*2;
controlWidget.inputWidget_FOV.value   = startingFOV;

// PDw and MTw
controlWidget.inputWidget_TR.minimum = minTR + 15;
controlWidget.inputWidget_TR.maximum = minTR + 30;
controlWidget.inputWidget_TR.value   = 28;

// T1w
controlWidget.inputWidget_TRT1.minimum = minTR;
controlWidget.inputWidget_TRT1.maximum = minTR + 30;
controlWidget.inputWidget_TRT1.value   = 18;

//FIXME: FA param names  
controlWidget.inputWidget_FA1.minimum = 3;
controlWidget.inputWidget_FA1.maximum = 20;
controlWidget.inputWidget_FA1.value   = startingFA2;
//FIXME: FA param names 
controlWidget.inputWidget_FA2.minimum = 6;
controlWidget.inputWidget_FA2.maximum = 19;
controlWidget.inputWidget_FA2.value   = startingFA1;

controlWidget.inputWidget_TE.minimum = minTE;
controlWidget.inputWidget_TE.maximum = 8;
controlWidget.inputWidget_TE.value   = 3;


function sessionClicked(chck){

  if (chck){
    controlWidget.sessionBIDS.enabled = true;
    controlWidget.sessionBIDS.setText("00");
  }else{
    controlWidget.sessionBIDS.enabled = false;
    controlWidget.sessionBIDS.text = "";
    controlWidget.sessionBIDS.placeholderText = "_ses-<index>";
  }
}

function acqClicked(chck){

  if (chck){
    controlWidget.acqBIDS.enabled = true;
    controlWidget.acqBIDS.setText("freeform");
  }else{
    controlWidget.acqBIDS.enabled = false;
    controlWidget.acqBIDS.text = "";
    controlWidget.acqBIDS.placeholderText = "_acq-<label>";
  }
}

var acqLabel = "";
function acqTextChanged(txt){
  acqLabel = txt;
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,"AcquisitionBIDS",acqLabel));

}

var sesIndex = "";
function sesTextChanged(txt){
  sesIndex = txt;
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,"SessionBIDS",sesIndex));

}

var subIndex = "";
function subTextChanged(txt){
  subIndex = txt;
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,"SubjectBIDS",subIndex));


}

// Defaults
function mtsLoopCommands(TRPD,TRT1,offsetIndex){
  // MTW
  if (offsetIndex == 0) { // 1200
    // Both MT pulses are of the same duration and energy, shape etc. just offsets are different
    // If more MT pulses are added to the lib, adjust accordingly.
    RTHLOGGER_WARNING("ENABLED OFFSET 1.2kHZ");
    var mtwCommand1 = new RthUpdateEnableBlockCommand(sequenceId, "mt1200", true);
    var mtwCommand2 = new RthUpdateEnableBlockCommand(sequenceId, "mt2000", false);
    var offsetFreq = 1200;
    var duration = SB.mt1200["<Fermi RF>.duration"];
  } else if (offsetIndex == 1){
    RTHLOGGER_WARNING("ENABLED OFFSET 2kHZ");
    var mtwCommand1 = new RthUpdateEnableBlockCommand(sequenceId, "mt1200", false);
    var mtwCommand2 = new RthUpdateEnableBlockCommand(sequenceId, "mt2000", true);
    var duration = SB.mt1200["<Fermi RF>.duration"];
    var offsetFreq = 2000;
  }
  else
  {
    // When the dropdown menu is initialized, the first arg passed is not 0 or 1.
    // So on init, code hits this condition, where we'll enable mt1200 block.
    RTHLOGGER_WARNING("Initializing...");
    RTHLOGGER_WARNING("ENABLED OFFSET 1.2kHZ");
    var mtwCommand1 = new RthUpdateEnableBlockCommand(sequenceId, "mt1200", true);
    var mtwCommand2 = new RthUpdateEnableBlockCommand(sequenceId, "mt2000", false);
    var offsetFreq = 1200;
    var duration = SB.mt1200["<Fermi RF>.duration"];
  }
  
  var mtwCommand3 = new RthUpdateIntParameterCommand(sequenceId, "", "setDesiredTR", "", TRPD);
  var mtwCommand4 = new  RthUpdateFloatParameterCommand(sequenceId, "excitation", "scaleRF", "", flipAngle2/flipAngle1); // Small
  var mtwCommand5 = new RthUpdateChangeMRIParameterCommand(sequenceId,{FlipAngle: flipAngle2, MTIndex: "on",FlipIndex: "01", RepetitionTime: 0.028, MTState: true, MTOffsetFrequency: offsetFreq, MTPulseDuration: duration, MTPulseShape: "Fermi"});
  var mtwGroup = new RthUpdateGroup([mtwCommand1, mtwCommand2, mtwCommand3, mtwCommand4, mtwCommand5]);
  
  // PDW
  var pdwCommand1 = new RthUpdateEnableBlockCommand(sequenceId, "mt1200", false);
  var pdwCommand2 = new RthUpdateEnableBlockCommand(sequenceId, "mt2000", false);
  var pdwCommand3 = new RthUpdateIntParameterCommand(sequenceId, "", "setDesiredTR", "", TRPD); 
  var pdwCommand4 = new  RthUpdateFloatParameterCommand(sequenceId, "excitation", "scaleRF", "", flipAngle2/flipAngle1); // Small
  var pdwCommand5 = new RthUpdateChangeMRIParameterCommand(sequenceId,{FlipAngle: flipAngle2, MTIndex: "off", FlipIndex: "01", RepetitionTime: 0.028, MTState: false});
  var pdwGroup = new RthUpdateGroup([pdwCommand1, pdwCommand2, pdwCommand3, pdwCommand4, pdwCommand5]);
  
  // T1w
  var t1wCommand1 = new RthUpdateEnableBlockCommand(sequenceId, "mt1200", false);
  var t1wCommand2 = new RthUpdateEnableBlockCommand(sequenceId, "mt2000", false);
  var t1wCommand3 = new RthUpdateIntParameterCommand(sequenceId, "", "setDesiredTR", "", TRT1);
  var t1wCommand4 = new  RthUpdateFloatParameterCommand(sequenceId, "excitation", "scaleRF", "", 1); // Large
  var t1wCommand5 = new RthUpdateChangeMRIParameterCommand(sequenceId,{FlipAngle: flipAngle1, MTIndex: "off", FlipIndex: "02", RepetitionTime: 0.018, MTState: false});
  var t1wGroup = new RthUpdateGroup([t1wCommand1, t1wCommand2, t1wCommand3, t1wCommand4, t1wCommand5]);
  
  
  rth.addCommand(new RthUpdateChangeMRIParameterCommand(sequenceId,{
    SubjectBIDS: controlWidget.subjectBIDS.text,
    SessionBIDS: controlWidget.sessionBIDS.text,
    AcquisitionBIDS: controlWidget.acqBIDS.text
  }));
  
  var loopCommands = [mtwGroup, pdwGroup, t1wGroup];
  
  rth.setLoopCommands(sequenceId, "mtsatloop", loopCommands);
  }

function changeOffset(offsetIndex){
  //RTHLOGGER_WARNING("Selected Offset" + idx);

  // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! FIXED PARAMS FOR NOW !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  mtsLoopCommands(28000,18000,offsetIndex)
}

// Connect UI elements to the callback functions.
var offsetFreqs = new Array();
offsetFreqs = ["Fermi | 1200","Fermi  | 2000"];
controlWidget.offsetSelectionWidget.addItems(offsetFreqs);
controlWidget.offsetSelectionWidget.setNeedsAttention(true);

controlWidget.offsetSelectionWidget.currentIndexChanged.connect(changeOffset);
changeOffset(controlWidget.offsetSelectionWidget.currentIndex);

controlWidget.acqBIDS.textChanged.connect(acqTextChanged);
acqTextChanged(controlWidget.acqBIDS.text);

controlWidget.sessionBIDS.textChanged.connect(sesTextChanged);
sesTextChanged(controlWidget.sessionBIDS.text);

controlWidget.subjectBIDS.textChanged.connect(subTextChanged);
subTextChanged(controlWidget.subjectBIDS.text);

controlWidget.isSessionBIDS.toggled.connect(sessionClicked);
sessionClicked(controlWidget.isSessionBIDS.checked)

controlWidget.isAcqBIDS.toggled.connect(acqClicked);
acqClicked(controlWidget.isAcqBIDS.checked)

controlWidget.inputWidget_FOV.valueChanged.connect(changeFOV);
changeFOV(controlWidget.inputWidget_FOV.value);

controlWidget.inputWidget_TR.valueChanged.connect(changeTR);
changeTR(controlWidget.inputWidget_TR.value);

controlWidget.inputWidget_FA1.valueChanged.connect(changeFlipAngle1);
changeFlipAngle1(controlWidget.inputWidget_FA1.value);

controlWidget.inputWidget_FA2.valueChanged.connect(changeFlipAngle2);
changeFlipAngle2(controlWidget.inputWidget_FA2.value);

controlWidget.inputWidget_TE.valueChanged.connect(changeTE);
changeTE(controlWidget.inputWidget_TE.value);

controlWidget.inputWidget_SliceThickness.valueChanged.connect(changeSliceThickness);
changeSliceThickness(controlWidget.inputWidget_SliceThickness.value);
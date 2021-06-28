/*
================== qMRLab vfa_t1 pulse sequence = 
This script is responsible for collecting raw data 
and reconstructing images. 
 
TO BE UPDATED

TODO: These parameters are to be fetched from controller. 

Author:  Agah Karakuzu agahkarakuzu@gmail.com
Created: October, 2019. 
// =================================================
*/

var sequenceId = rth.sequenceId();
var instanceName = rth.instanceName();

var observer = new RthReconRawObserver();
observer.setSequenceId(sequenceId);
observer.observeValueForKey("acquisition.samples", "samples");
// Disable button after observer is discond
observer.scanDisabled.connect(rth.deactivateScanButton);

function reconBlock(input) {
  
  var that  = this;

  this.attenSplit = new RthReconSplitter();
  this.attenSplit.objectName = "Atten Split ";
  this.attenSplit.setInput(input);

  this.attenOutput = function() {
    return this.attenSplit.output(0);
  };

 this.sort3d = new RthReconSort();
 this.sort3d.setIndexKeys(["acquisition.<Cartesian Readout>.index", "acquisition.<Repeat 1>.index"]);
 this.sort3d.setInput(this.attenSplit.output(1));
 this.sort3d.observeKeys(["mri.RunNumber"]);
 this.sort3d.observedKeysChanged.connect(
  function(keys) {
    that.sort3d.resetAccumulation();
    var yEncodes = keys["reconstruction.phaseEncodes"];
    var samples = keys["acquisition.samples"];
    //var coils = keys["acquisition.channels"];
    var zEncodes = keys["reconstruction.zPartitions"];
    //this.sort3d.extent = [samples, coils, yEncodes, zEncodes]; // if the input is [samples x coils]
    that.sort3d.extent = [samples, yEncodes, zEncodes];
    that.sort3d.accumulate = yEncodes * zEncodes;
  }
);

  this.fft = new RthReconImageFFT();
  this.fft.setInput(this.sort3d.output());
  // Disable after FFT node
  this.output = function() {
  return this.fft.output();
  };
}

// For each `coil we need sort and FFT.
var sos = new RthReconImageSumOfSquares();
var block  = [];

var getRxAtten = new RthUpdateGetRxAttenuationCommand(sequenceId, "readout"); rth.addCommand(getRxAtten);
var atten = getRxAtten.receivedData();
RTHLOGGER_ERROR("Received atten is (mtsat)" + atten);

var rxAtten = new RthReconRawApplyRxAttenuation();
rxAtten.objectName = "Rx Atten";
rxAtten.lowerLimit = 0.3;
rxAtten.upperLimit = 0.75;
rxAtten.newAttenuation.connect(function(newAtten) {
  rth.addCommand(new RthUpdateFloatParameterCommand(sequenceId, "readout", "setRxAttenuation", "", newAtten));
});


function connectCoils(coils){
  block = [];
  for (var i = 0; i<coils; i++){
    block[i] = new reconBlock(observer.output(i));
    sos.setInput(i,block[i].output());
    rxAtten.setInput(i, block[i].attenOutput());
  }
 rth.collectGarbage();
}

observer.coilsChanged.connect(connectCoils);

rth.importJS("lib:RthImageThreePlaneOutput.js");

function ExportBlock(input){

  var that = this;

  //var imageExport = new RthReconToQmrlab();
  // This is a bit annoying, but the only option for now. 
  this.imageExport = new RthReconImageExport();

  this.changeInformation = new RthReconImageChangeInformation();
  
  // Generic keys
  this.reconKeys = new Array();
  this.reconKeys = [
    // Sequence-specific keys
    "mri.SequenceName",
    "mri.ScanningSequence",
    "mri.SequenceVariant",
    "mri.MRAcquisitionType",
    "mri.NumberOfCoils",
    "mri.ExcitationTimeBandwidth",
    "mri.ExcitationDuration",
    "mri.ExcitationType",
    "mri.VoxelSpacing",
    "mri.MTState",
    "mri.MTOffsetFrequency",
    "mri.MTPulseShape",
    "mri.MTPulseDuration",
    "mri.EchoTime",
    "mri.RepetitionTime",
    "mri.FlipAngle1",
    "mri.FlipAngle2",
    "mri.FlipAngle",
    "mri.SliceThickness",
    "reconstruction.phaseEncodes",
    "acquisition.samples",
    "reconstruction.zPartitions",
    "mri.PreAcqDuration",
    "mri.FlipIndex",
    "mri.MTIndex",
    "mri.SubjectBIDS",
    "mri.SessionBIDS",
    "mri.AcquisitionBIDS",
    "mri.ExcitationSlabThickness",
    // Generic RTHawk keys
    "geometry.TranslationX",
    "geometry.TranslationY",
    "geometry.TranslationZ",
    "geometry.QuaternionW",
    "geometry.QuaternionX",
    "geometry.QuaternionY",
    "geometry.QuaternionZ",
    "geometry.FieldOfViewX",
    "geometry.FieldOfViewY",
    "geometry.FieldOfViewZ",
    "equipment.StationName",
    "equipment.regulatory/chronaxie",
    "equipment.regulatory/coilSar",
    "equipment.regulatory/extremityCoilSar",
    "equipment.regulatory/extremityPeakSar",
    "equipment.regulatory/governingBody",
    "equipment.regulatory/operatingMode",
    "equipment.regulatory/peakSar",
    "equipment.regulatory/reillyPercentage",
    "equipment.regulatory/rheobase",
    "equipment.regulatory/sarScaleFactor",
    "equipment.regulatory/sarUnits",
    "equipment.regulatory/wbSar",
    "equipment.rf/acquisitionDelayResolution",
    "equipment.rf/bodyMaxAvgPower",
    "equipment.rf/localMaxDutyCycle",
    "equipment.rf/localRatedPower",
    "equipment.rf/maxReadoutBw",
    "equipment.rf/maxUniqueReadouts",
    "equipment.rf/rxChannels",
    "equipment.rf/samplingPeriod",
    "equipment.device/acquisitionHost",
    "equipment.coils",
    "equipment.bootTime",
    "equipment.activationDate",
    "equipment.device/manufacturer",
    "equipment.device/manufacturerModelName",
    "equipment.device/deviceSerialNumber",
    "equipment.device/softwareVersions",
    "equipment.device/canChangeDemodulationDelay",
    "equipment.device/controlConnectionBigEndian",
    "equipment.general/apiVersion",
    "equipment.general/currentDateTime",
    "equipment.general/serverVersion",
    "equipment.gradient/dcGain",
    "equipment.gradient/gContIRms",
    "equipment.gradient/nominalRmsGradientLimit",
    "equipment.gradient/nominalRmsSlewSlope",
    "equipment.gradient/samplingPeriod",
    "equipment.gradient/xDbdtDistance",
    "equipment.gradient/xMaximumAmplitude",
    "equipment.gradient/xRiseTime",
    "equipment.gradient/xShimRes",
    "equipment.gradient/xWarpCoefficients",
    "equipment.gradient/yDbdtDistance",
    "equipment.gradient/yMaximumAmplitude",
    "equipment.gradient/yRiseTime",
    "equipment.gradient/yShimRes",
    "equipment.gradient/yWarpCoefficients",
    "equipment.gradient/zDbdtDistance",
    "equipment.gradient/zMaximumAmplitude",
    "equipment.gradient/zRiseTime",
    "equipment.gradient/zShimRes",
    "equipment.gradient/zWarpCoefficients",
    "equipment.hardwareAddress",
    "equipment.InstitutionAddress",
    "equipment.InstitutionalDepartmentName",
    "equipment.InstitutionName",
    "equipment.licenseType",
    "equipment.magnet/fieldStrength",
    "equipment.udiLIC",
    "equipment.udiPCNMajor",
    "equipment.udiPCNPrefix",
    "equipment.udiUMID",
    "equipment.prescan/refVoltage",
    "equipment.prescan/tg",
    "equipment.prescan/maxB1",
    "equipment.prescan/cf",
    "equipment.prescan/nucleus",
    "equipment.prescan/r1",
    "equipment.prescan/r2",
    "equipment.prescan/refPulseInGauss",
    "equipment.prescan/status",
    "equipment.prescan/xs",
    "equipment.prescan/ys",
    "equipment.prescan/zs",
    "equipment.hostManufacturerModelName",
    "equipment.hostSoftwareVersions",
    "equipment.magnet/fieldStrength",
    "acquisition.peakAmplitude",
    "acquisition.readoutReferencePoint",
    "acquisition.resolution",
    "acquisition.samples",
    "acquisition.samplingRate",
    "acquisition.SequenceId",
    "acquisition.slice",
    "acquisition.triggerCount",
    "acquisition.triggerLead",
    "acquisition.timesincetrig",
    "acquisition.view",
    "patient.AdditionalPatientHistory",
    "patient.PatientAge",
    "patient.PatientBirthDate",
    "patient.PatientDisplayName",
    "patient.PatientID",
    "patient.PatientName",
    "patient.PatientSex",
    "patient.PatientWeight",
    "reconstruction.loopIndexNames",
    "reconstruction.blockNames",
    "series.interfaceState", 
    "series.Modality",
    "series.offsetFromUTC",
    "series.PatientPosition",
    "series.PrescribedGeometry",
    "series.ProtocolName",
    "series.SeriesDescription",
    "series.timezone",
    "exportedSeries.BodyPartExamined",
    "exportedSeries.FrameOfReferenceUID",
    "study.DBdtMode",
    "study.ImagedNucleus",
    "study.MagneticFieldStrength",
    "study.ReceiveCoilName",
    "study.StudyDate",
    "study.StudyDescription",
    "study.StudyTime",
    "equipment.prescan/cf",
  ];

  // Siemens specific keys 
  this.siemensKeys = new Array();
  this.siemensKeys = [
    "equipment.gradient/siemens/asCOMP_0/tModuleName",
    "equipment.gradient/siemens/asCOMP_0/tName",
    "equipment.gradient/siemens/asGPAParameters_0/ai32GradRegX_0",
    "equipment.gradient/siemens/asGPAParameters_0/ai32GradRegY_0",
    "equipment.gradient/siemens/asGPAParameters_0/ai32GradRegZ_0",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradClipRiseTime",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplAbsolute",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplFast",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplNominal",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplNormal",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMaxAmplWhisper",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMinRiseTimeAbsolute",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMinRiseTimeAbsolute",
    "equipment.gradient/siemens/asGPAParameters_0/flDefGradMinRiseTimeFast",
    "equipment.gradient/siemens/asGPAParameters_0/flGradDelayX",
    "equipment.gradient/siemens/asGPAParameters_0/flGradDelayY",
    "equipment.gradient/siemens/asGPAParameters_0/flGradDelayZ",
    "equipment.gradient/siemens/asGPAParameters_0/flGradSensitivityX",
    "equipment.gradient/siemens/asGPAParameters_0/flGradSensitivityY",
    "equipment.gradient/siemens/asGPAParameters_0/flGradSensitivityZ",
    "equipment.gradient/siemens/asGPAParameters_0/flSysMaxAmplAbsolute_0",
    "equipment.gradient/siemens/asGPAParameters_0/flSysMaxAmplAbsolute_1",
    "equipment.gradient/siemens/asGPAParameters_0/flSysMaxAmplAbsolute_2",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flFoVMax",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flFreqDependentResistanceLinear",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flFreqDependentResistanceQuadratic",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flGScaleFactorX",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flGScaleFactorY",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/flGScaleFactorZ",
    "equipment.gradient/siemens/asGPAParameters_0/sGCParameters/tType",
    "equipment.gradient/siemens/asGPAParameters_0/tType",
    "equipment.gradient/siemens/flGSWDAX_0",
    "equipment.gradient/siemens/flGSWDAX_1",
    "equipment.gradient/siemens/flGSWDAX_2",
    "equipment.gradient/siemens/flGSWDAY_0",
    "equipment.gradient/siemens/flGSWDAY_1",
    "equipment.gradient/siemens/flGSWDAY_2",
    "equipment.gradient/siemens/flGSWDAZ_0",
    "equipment.gradient/siemens/flGSWDAZ_1",
    "equipment.gradient/siemens/flGSWDAZ_2",
    "equipment.gradient/siemens/flGSWDHWCorrectionFactorX",
    "equipment.gradient/siemens/flGSWDHWCorrectionFactorY",
    "equipment.gradient/siemens/flGSWDHWCorrectionFactorZ",
    "equipment.gradient/siemens/flSHIMMaxGradOffset",
    "equipment.gradient/siemens/lGSWDPhaseEncodingLines_0",
    "equipment.gradient/siemens/lGSWDPhaseEncodingLines_1",
    "equipment.gradient/siemens/lGSWDPhaseEncodingLines_2",
    "equipment.gradient/siemens/lGSWDtd_0_0",
    "equipment.gradient/siemens/lGSWDtd_0_1",
    "equipment.gradient/siemens/lGSWDtd_0_2",
    "equipment.gradient/siemens/lGSWDtd_0_3",
    "equipment.gradient/siemens/tGradientEngine"
  ];

  this.geKeys = new Array();

  this.geKeys = [
    "equipment.Signa/Gradient/xrisetime",
    "equipment.Signa/Gradient/yrisetime",
    "equipment.Signa/Gradient/zrisetime",
    "equipment.Signa/Gradient/systemmaxfov",
    "equipment.Signa/Gradient/xamptran",
    "equipment.Signa/Gradient/yamptran",
    "equipment.Signa/Gradient/zamptran",
    "equipment.Signa/Gradient/xfsamp",
    "equipment.Signa/Gradient/yfsamp",
    "equipment.Signa/Gradient/zfsamp",
    "equipment.Signa/Gradient/xirms",
    "equipment.Signa/Gradient/yirms",
    "equipment.Signa/Gradient/zirms",
    "equipment.Signa/Gradient/xiavrgabs",
    "equipment.Signa/Gradient/yiavrgabs",
    "equipment.Signa/Gradient/ziavrgabs",
    "equipment.Signa/Gradient/xps_avghvpwrlimit",
    "equipment.Signa/Gradient/xps_avglvpwrlimit",
    "equipment.Signa/Gradient/xps_avgpdulimit",
    "equipment.Signa/Gradient/psdgraddelayx",
    "equipment.Signa/Gradient/psdgraddelayy",
    "equipment.Signa/Gradient/psdgraddelayz",
    "equipment.Signa/Gradient/psdgradwait",
    "equipment.Signa/Gradient/psdrfwait",
    "equipment.Signa/Gradient/srmode",
    "equipment.Signa/Gradient/slew_arthigh",
    "equipment.Signa/Gradient/slew_artmedium",
    "equipment.Signa/Gradient/maxb1rms",
    "equipment.Signa/Gradient/lcoil",
    "equipment.Signa/Gradient/gradient_coil_temperature_base_c",
    "equipment.Signa/Gradient/gradient_coil_temperature_limit_c",
    "equipment.Signa/Gradient/gradient_coil_time_constant_s",
    "equipment.Signa/Gradient/gradient_coil_power_ss_limit_kw",
    "equipment.Signa/Gradient/dbdtdistx",
    "equipment.Signa/Gradient/dbdtdisty",
    "equipment.Signa/Gradient/dbdtdistz",
    "equipment.Signa/Gradient/gburstime",
    "equipment.Signa/Gradient/gcoiltype",
    "equipment.Signa/Gradient/gmax_arthigh",
    "equipment.Signa/Gradient/gmax_artmedium",
    "equipment.Signa/Gradient/gpeakirms",
    "equipment.Signa/Gradient/coilac_gain",
    "equipment.Signa/Gradient/coilac_gain",
    "equipment.Signa/Gradient/coildc_fftpoints",
    "equipment.Signa/MR/rfmaxattenuation",
    "equipment.Signa/MR/rfampftquadratic",
    "equipment.Signa/MR/rfampftlinear",
    "equipment.Signa/MR/rfdelay"
  ];

  this.changeInformation.observeKeys(["equipment.device/manufacturer"]);
  this.imageExport.observedKeysChanged.connect(function(keys){
    if (keys["equipment.device/manufacturer"] == "GE MEDICAL SYSTEMS"){
      RTHLOGGER_WARNING('Appending metadata for ' + keys["equipment.device/manufacturer"]);
      that.reconKeys = that.reconKeys.concat(that.geKeys);
      for (var i = 0; i<that.reconKeys.length; i++){
        that.imageExport.addInformationKey(that.reconKeys[i]);
      }
    }else{
      RTHLOGGER_WARNING('Appending metadata for ' + keys["equipment.device/manufacturer"]);
      that.reconKeys = that.reconKeys.concat(that.siemensKeys);
      for (var i = 0; i<that.reconKeys.length; i++){
        that.imageExport.addInformationKey(that.reconKeys[i]);
      }
    }
  
  });

this.imageExport.observeKeys([
  "mri.SubjectBIDS",
  "mri.SessionBIDS",
  "mri.AcquisitionBIDS",
  "mri.FlipIndex",
  "mri.RepetitionTime",
  "mri.FlipAngle",
  "mri.MTState",
  "mri.MTIndex"
]);

this.imageExport.observedKeysChanged.connect(function(keys){

    var exportDirectory = "qMRLabAcq/rthRecon/";
    var flipIndex = keys["mri.FlipIndex"];
    var MTIndex = keys["mri.MTIndex"];
    var subjectBIDS  = "sub-" + keys["mri.SubjectBIDS"];
    var sessionBIDS = (keys["mri.SessionBIDS"]) ? "_ses-" + keys["mri.SessionBIDS"] : "";
    var acquisitionBIDS = (keys["mri.AcquisitionBIDS"]) ? "_acq-" + keys["mri.AcquisitionBIDS"] : "";
    var exportFileName  = exportDirectory + subjectBIDS + sessionBIDS + acquisitionBIDS + "_flip-" + flipIndex + "_mt-" +  MTIndex + "_MTS.dat";
    that.imageExport.setFileName(exportFileName);
    RTHLOGGER_WARNING(exportFileName);
    RTHLOGGER_WARNING("FA:" + keys["mri.FlipAngle"] + "TR:" + keys["mri.RepetitionTime"] + "MT:" + keys["mri.MTState"]);
  });

  this.imageExport.objectName = "save_image";
  this.imageExport.setInput(input);

  // This is a sink node, hence no output.
}


var splitter = RthReconSplitter();
splitter.objectName = "splitOutput";
splitter.setInput(sos.output());

var threePlane = new RthImageThreePlaneOutput();
threePlane.setInput(splitter.output(0));

var exporter  = new ExportBlock(splitter.output(1));

# Premiere 26.3.2 surface, as dumped from this panel (2026-09-05)

Every name below was read by reflection from a live Premiere 26.3.2 through the dev panel's "Dump Premiere surface"
button (read-only). `m:` is a method, `p:` a property. A name being here means it exists on that object; it says
nothing about arguments or behaviour. Use it to stop guessing names. Rows for `Track(audio)`, `qe.Track(audio)` and
`ProjectItem(bin)` were identical to their video/footage rows and are omitted. `Marker` rows were empty because the
sandbox had no markers. Third-party plug-ins (Red Giant `uni.*`, Magic Bullet, iZotope Neutron, Apple `AU*`) appear in
the effect lists because they are installed on the machine that dumped this; they are not Premiere's.

## app (Application)

`m:addEventListener`, `m:bind`, `m:broadcastPrefsChanged`, `m:dispatchEvent`, `m:enableQE`, `m:getConstant`, `m:getCurrentProjectViewSelection`, `m:getEnableProxies`, `m:getProjectFromViewID`, `m:getProjectViewIDs`, `m:getProjectViewSelection`, `m:getWorkspaces`, `m:isDocument`, `m:isDocumentOpen`, `m:isWindowVisible`, `m:newPrProduction`, `m:openDocument`, `m:openFCPXML`, `m:openPrProduction`, `m:quit`, `m:refresh`, `m:removeEventListener`, `m:setEnableProxies`, `m:setEnableTranscodeOnIngest`, `m:setExtensionPersistent`, `m:setProjectViewSelection`, `m:setSDKEventMessage`, `m:setScratchDiskPath`, `m:setTimeout`, `m:setWorkspace`, `m:showCursor`, `m:trace`, `m:unbind`, `m:write`, `p:anywhere`, `p:build`, `p:encoder`, `p:getAppPrefPath`, `p:getAppSystemPrefPath`, `p:getPProPrefPath`, `p:getPProSystemPrefPath`, `p:isStagingEnvironment`, `p:learnPanelContentDirPath`, `p:learnPanelExampleProjectDirPath`, `p:path`, `p:production`, `p:project`, `p:projectManager`, `p:projects`, `p:properties`, `p:sourceMonitor`, `p:userGuid`, `p:version`

## app.project (Project)

`m:addPropertyToProjectMetadataSchema`, `m:applyLumetriPreset`, `m:applyProjectSnapshot`, `m:closeDocument`, `m:consolidateDuplicates`, `m:createNewSequence`, `m:createNewSequenceFromClips`, `m:deleteSequence`, `m:disableCopyToLocationSetting`, `m:enableAdobeLocationCopy`, `m:enableSharedLocationCopy`, `m:exportAAF`, `m:exportFinalCutProXML`, `m:exportOMF`, `m:exportTimeline`, `m:getAllLumetriPresetsList`, `m:getGraphicsWhiteLuminance`, `m:getInsertionBin`, `m:getLUTInterpolationMethod`, `m:getLumetriPresetsForFolderList`, `m:getProjectPanelMetadata`, `m:getSharedLocation`, `m:getSupportedGraphicsWhiteLuminances`, `m:getSupportedLUTInterpolationMethods`, `m:importAEComps`, `m:importAllAEComps`, `m:importFiles`, `m:importSequences`, `m:isAdobeLocationCopyEnabled`, `m:isSharedLocationCopyEnabled`, `m:openSequence`, `m:pauseGrowing`, `m:placeAsset`, `m:save`, `m:saveAs`, `m:saveProjectSnapshot`, `m:setEnableTranscodeOnIngest`, `m:setGraphicsWhiteLuminance`, `m:setLUTInterpolationMethod`, `m:setLogColorManagement`, `m:setProjectPanelMetadata`, `m:setScratchDiskPath`, `m:writeSidecarFile`, `p:activeSequence`, `p:cloudProjectlocalID`, `p:documentID`, `p:isCloudProject`, `p:name`, `p:path`, `p:rootItem`, `p:sequences`

## app.projects (ProjectCollection)

`p:length`, `p:numProjects`

## app.encoder (Encoder)

`m:addEventListener`, `m:bind`, `m:dispatchEvent`, `m:encodeFile`, `m:encodeProjectItem`, `m:encodeSequence`, `m:exportWithPresetObject`, `m:getExporters`, `m:getPresetObject`, `m:lastExportMediaFolder`, `m:launchEncoder`, `m:removeEventListener`, `m:selectFolder`, `m:setEmbeddedXMPEnabled`, `m:setSidecarXMPEnabled`, `m:setTimeout`, `m:startBatch`, `m:unbind`, `p:ENCODE_ENTIRE`, `p:ENCODE_IN_TO_OUT`, `p:ENCODE_WORKAREA`

## app.sourceMonitor (SourceMonitor)

`m:closeAllClips`, `m:closeClip`, `m:getPosition`, `m:getProjectItem`, `m:openFilePath`, `m:openProjectItem`, `m:play`

## app.properties (Properties)

`m:clearProperty`, `m:doesPropertyExist`, `m:getProperty`, `m:isPropertyReadOnly`, `m:setProperty`

## app.anywhere (Anywhere)

`m:addEventListener`, `m:bind`, `m:dispatchEvent`, `m:getAuthenticationToken`, `m:getCurrentEditingSessionActiveSequenceURL`, `m:getCurrentEditingSessionSelectionURL`, `m:getCurrentEditingSessionURL`, `m:isProductionOpen`, `m:listProductions`, `m:openProduction`, `m:openTeamProjectSnapshot`, `m:removeEventListener`, `m:setAuthenticationToken`, `m:setTimeout`, `m:unbind`

## ProjectItem(root) (ProjectItem)

`m:attachProxy`, `m:canChangeMediaPath`, `m:canProxy`, `m:changeMediaPath`, `m:clearInPoint`, `m:clearOutPoint`, `m:createBin`, `m:createSmartBin`, `m:createSubClip`, `m:deleteBin`, `m:detachProxy`, `m:findItemsMatchingMediaPath`, `m:getColorLabel`, `m:getColorSpace`, `m:getEmbeddedLUTID`, `m:getInPoint`, `m:getInputLUTID`, `m:getMarkers`, `m:getMediaPath`, `m:getOriginalColorSpace`, `m:getOutPoint`, `m:getOverrideColorSpace`, `m:getProjectColumnsMetadata`, `m:getProjectMetadata`, `m:getProxyPath`, `m:getXMPMetadata`, `m:hasProxy`, `m:isAdjustmentLayer`, `m:isColorManagedMedia`, `m:isMergedClip`, `m:isMulticamClip`, `m:isOffline`, `m:isReference`, `m:isSequence`, `m:isValidOverrideColorSpace`, `m:moveBin`, `m:refreshMedia`, `m:renameBin`, `m:saveProjectSnapshot`, `m:select`, `m:setColorLabel`, `m:setInPoint`, `m:setOffline`, `m:setOutPoint`, `m:setOverrideColorSpace`, `m:setOverrideFrameRate`, `m:setOverridePixelAspectRatio`, `m:setProjectMetadata`, `m:setScaleToFrameSize`, `m:setStartTime`, `m:setXMPMetadata`, `m:startTime`, `m:videoComponents`, `p:children`, `p:getOverrideColorSpaceList`, `p:interpretedTimebase`, `p:name`, `p:nodeId`, `p:sourceTimebase`, `p:timeDisplayFormat`, `p:treePath`, `p:type`

## ProjectItem(footage) (ProjectItem)

`m:attachProxy`, `m:canChangeMediaPath`, `m:canProxy`, `m:changeMediaPath`, `m:clearInPoint`, `m:clearOutPoint`, `m:createBin`, `m:createSmartBin`, `m:createSubClip`, `m:deleteBin`, `m:detachProxy`, `m:findItemsMatchingMediaPath`, `m:getColorLabel`, `m:getColorSpace`, `m:getEmbeddedLUTID`, `m:getInPoint`, `m:getInputLUTID`, `m:getMarkers`, `m:getMediaPath`, `m:getOriginalColorSpace`, `m:getOutPoint`, `m:getOverrideColorSpace`, `m:getProjectColumnsMetadata`, `m:getProjectMetadata`, `m:getProxyPath`, `m:getXMPMetadata`, `m:hasProxy`, `m:isAdjustmentLayer`, `m:isColorManagedMedia`, `m:isMergedClip`, `m:isMulticamClip`, `m:isOffline`, `m:isReference`, `m:isSequence`, `m:isValidOverrideColorSpace`, `m:moveBin`, `m:refreshMedia`, `m:renameBin`, `m:saveProjectSnapshot`, `m:select`, `m:setColorLabel`, `m:setInPoint`, `m:setOffline`, `m:setOutPoint`, `m:setOverrideColorSpace`, `m:setOverrideFrameRate`, `m:setOverridePixelAspectRatio`, `m:setProjectMetadata`, `m:setScaleToFrameSize`, `m:setStartTime`, `m:setXMPMetadata`, `m:startTime`, `m:videoComponents`, `p:children`, `p:getOverrideColorSpaceList`, `p:interpretedTimebase`, `p:name`, `p:nodeId`, `p:sourceTimebase`, `p:timeDisplayFormat`, `p:treePath`, `p:type`

## ProjectItemCollection (ProjectItemCollection)

`p:length`, `p:numItems`

## ProjectItem.getFootageInterpretation() (FootageInterpretation)

`m:setInputLUTFromFilePath`, `p:ALPHACHANNEL_IGNORE`, `p:ALPHACHANNEL_NONE`, `p:ALPHACHANNEL_PREMULTIPLIED`, `p:ALPHACHANNEL_STRAIGHT`, `p:FIELD_TYPE_DEFAULT`, `p:FIELD_TYPE_LOWERFIRST`, `p:FIELD_TYPE_PROGRESSIVE`, `p:FIELD_TYPE_UPPERFIRST`, `p:alphaUsage`, `p:colorSpace`, `p:fieldType`, `p:frameRate`, `p:ignoreAlpha`, `p:inputLUTID`, `p:invertAlpha`, `p:pixelAspectRatio`, `p:removePulldown`, `p:vrConformProjectionType`, `p:vrHorizontalView`, `p:vrLayoutType`, `p:vrVerticalView`

## ProjectItem.getColorSpace() (ColorSpace)

`m:getPeakLuminance`, `m:setPeakLuminance`, `p:empty`, `p:isSceneReferred`, `p:matrixEquation`, `p:name`, `p:primaries`, `p:transferCharacteristic`

## ProjectItem.getInPoint() (Time)

`m:getFormatted`, `m:setSecondsAsFraction`, `p:seconds`, `p:ticks`

## Sequence (Sequence)

`m:attachCustomProperty`, `m:autoReframeSequence`, `m:clone`, `m:close`, `m:createCaptionTrack`, `m:createSubsequence`, `m:exportAsFinalCutProXML`, `m:exportAsMediaDirect`, `m:exportAsProject`, `m:getExportFileExtension`, `m:getInPoint`, `m:getInPointAsTime`, `m:getOutPoint`, `m:getOutPointAsTime`, `m:getPlayerPosition`, `m:getSelection`, `m:getSettings`, `m:getWorkAreaInPoint`, `m:getWorkAreaInPointAsTime`, `m:getWorkAreaOutPoint`, `m:getWorkAreaOutPointAsTime`, `m:importMGT`, `m:importMGTFromLibrary`, `m:insertClip`, `m:isDoneAnalyzingForVideoEffects`, `m:isWorkAreaEnabled`, `m:linkSelection`, `m:overwriteClip`, `m:performSceneEditDetectionOnSelection`, `m:renderVideoFrameAtTime`, `m:renderVideoFrameAtTimeWithColorSpace`, `m:setEnableProxies`, `m:setInPoint`, `m:setOutPoint`, `m:setPlayerPosition`, `m:setSelection`, `m:setSettings`, `m:setWorkAreaEnabled`, `m:setWorkAreaInPoint`, `m:setWorkAreaOutPoint`, `m:setZeroPoint`, `m:unlinkSelection`, `p:audioDisplayFormat`, `p:audioTracks`, `p:end`, `p:frameSizeHorizontal`, `p:frameSizeVertical`, `p:id`, `p:markers`, `p:name`, `p:projectItem`, `p:sequenceID`, `p:timebase`, `p:videoDisplayFormat`, `p:videoTracks`, `p:zeroPoint`

## Sequence.getSettings() (SequenceSettings)

`p:audioChannelCount`, `p:audioChannelType`, `p:audioDisplayFormat`, `p:audioSampleRate`, `p:autoInputGamutCompressionEnabled`, `p:autoToneMapEnabled`, `p:compositeLinearColor`, `p:editingMode`, `p:gamutMappingControls`, `p:maximumBitDepth`, `p:maximumRenderQuality`, `p:previewCodec`, `p:previewFileFormat`, `p:previewFrameHeight`, `p:previewFrameWidth`, `p:videoDisplayFormat`, `p:videoFieldType`, `p:videoFrameHeight`, `p:videoFrameRate`, `p:videoFrameWidth`, `p:videoPixelAspectRatio`, `p:vrHorzCapturedView`, `p:vrLayout`, `p:vrProjection`, `p:vrVertCapturedView`, `p:workingColorSpace`, `p:workingColorSpaceList`

## TrackCollection(video) (TrackCollection)

`p:length`, `p:numTracks`

## Track(video) (Track)

`m:insertClip`, `m:isLocked`, `m:isMuted`, `m:isTargeted`, `m:overwriteClip`, `m:setLocked`, `m:setMute`, `m:setTargeted`, `p:clips`, `p:id`, `p:mediaType`, `p:name`, `p:transitions`

## TrackItemCollection (TrackItemCollection)

`p:length`, `p:numItems`

## TrackItem(video) (TrackItem)

`m:getLinkedItems`, `m:getMGTComponent`, `m:getSpeed`, `m:isAdjustmentLayer`, `m:isMGT`, `m:isSelected`, `m:isSpeedReversed`, `m:move`, `m:remove`, `m:setSelected`, `p:components`, `p:disabled`, `p:duration`, `p:end`, `p:inPoint`, `p:matchName`, `p:mediaType`, `p:name`, `p:nodeId`, `p:outPoint`, `p:parentTrackIndex`, `p:projectItem`, `p:start`, `p:type`

## Time (Time)

`m:getFormatted`, `m:setSecondsAsFraction`, `p:seconds`, `p:ticks`

## ComponentCollection (ComponentCollection)

`p:length`, `p:numItems`

## Component (Component)

`p:displayName`, `p:instanceName`, `p:matchName`, `p:properties`

## ComponentParamCollection (ComponentParamCollection)

`m:getParamForDisplayName`, `p:length`, `p:numItems`

## ComponentParam (ComponentParam)

`m:addKey`, `m:areKeyframesSupported`, `m:findNearestKey`, `m:findNextKey`, `m:findPreviousKey`, `m:getColorValue`, `m:getKeys`, `m:getValue`, `m:getValueAtKey`, `m:getValueAtTime`, `m:isEmpty`, `m:isTimeVarying`, `m:keyExistsAtTime`, `m:removeKey`, `m:removeKeyRange`, `m:setColorValue`, `m:setInterpolationTypeAtKey`, `m:setTimeVarying`, `m:setValue`, `m:setValueAtKey`, `p:displayName`

## MarkerCollection (MarkerCollection)

`m:createMarker`, `m:deleteMarker`, `m:getFirstMarker`, `m:getLastMarker`, `m:getNextMarker`, `m:getPrevMarker`, `p:length`, `p:numMarkers`

## qe (QEApplication)

`m:addEventListener`, `m:beginDroppedFrameLogging`, `m:disablePerformanceLogging`, `m:dispatchEvent`, `m:enablePerformanceLogging`, `m:enablePlayStats`, `m:endDroppedFrameLogging`, `m:executeConsoleCommand`, `m:exit`, `m:getDebugDatabaseEntry`, `m:getDroppedFrames`, `m:getModalWindowID`, `m:getProgressContainerJSON`, `m:getSequencePresets`, `m:isFeatureEnabled`, `m:isPerformanceLoggingEnabled`, `m:localize`, `m:newProject`, `m:open`, `m:outputToConsole`, `m:removeEventListener`, `m:resetProject`, `m:setAudioChannelMapping`, `m:setDebugDatabaseEntry`, `m:startPlayback`, `m:stop`, `m:stopPlayback`, `m:wait`, `m:write`, `p:audioChannelMapping`, `p:codeProfiler`, `p:config`, `p:ea`, `p:language`, `p:location`, `p:name`, `p:platform`, `p:project`, `p:source`, `p:tqm`, `p:version`

## qe.project (QEProject)

`m:close`, `m:deletePreviewFiles`, `m:findItemByID`, `m:flushCache`, `m:getActiveSequence`, `m:getAudioEffectByName`, `m:getAudioEffectList`, `m:getAudioTransitionByName`, `m:getAudioTransitionList`, `m:getBinAt`, `m:getItemAt`, `m:getRemainingMetadataCacheIndexCount`, `m:getRendererNames`, `m:getSequenceAt`, `m:getSequenceItemAt`, `m:getVideoEffectByName`, `m:getVideoEffectList`, `m:getVideoTransitionByName`, `m:getVideoTransitionList`, `m:import`, `m:importAEComps`, `m:importAllAEComps`, `m:importFiles`, `m:importPSD`, `m:importProject`, `m:init`, `m:newBarsAndTone`, `m:newBin`, `m:newBlackVideo`, `m:newColorMatte`, `m:newSequence`, `m:newSmartBin`, `m:newTransparentVideo`, `m:newUniversalCountingLeader`, `m:redo`, `m:resetNumFilesCounter`, `m:save`, `m:saveAs`, `m:setRenderer`, `m:sizeOnDisk`, `m:undo`, `m:undoStackIndex`, `p:currentRendererName`, `p:importFailures`, `p:isAudioConforming`, `p:isAudioPeakGenerating`, `p:isIndexing`, `p:name`, `p:numActiveProgressItems`, `p:numAudioPeakGeneratedFiles`, `p:numBins`, `p:numConformedFiles`, `p:numIndexedFiles`, `p:numItems`, `p:numSequenceItems`, `p:numSequences`, `p:path`

## qe.source (Object)

`m:openFilePath`, `p:clip`, `p:player`

## qe.ea (QEEA)

`m:addEventListener`, `m:benchmarkReflectEverything`, `m:canShare`, `m:closeProduction`, `m:convertProductionIntoProject`, `m:convertProjectIntoProduction`, `m:createProduction`, `m:dispatchEvent`, `m:doesEditingSessionHaveLocalMedia`, `m:doesProjectHaveUnsharedChanges`, `m:fetchIMSAccessToken`, `m:getAdminInterface`, `m:getArchivedProductionList`, `m:getConflicts`, `m:getCreativeCloudIdentity`, `m:getDiscoveryURL`, `m:getInviteList`, `m:getProcessID`, `m:getProductionByID`, `m:getProductionList`, `m:getRemoteServerBuildVersion`, `m:getSessionSyncStatus`, `m:getUserEmail`, `m:getUsername`, `m:isCollaborationOnly`, `m:isConvertProductionIntoProjectRunning`, `m:isConvertProjectIntoProductionRunning`, `m:isHostedCollaborationOnly`, `m:isLoggedIn`, `m:isShareCommandEnabled`, `m:isSyncCommandEnabled`, `m:openCleanSandbox`, `m:openProduction`, `m:removeEventListener`, `m:renameProduction`, `m:resolveConflict`, `m:saveProductionAs`, `m:setAuthToken`, `m:setLocalHubConnectionStatus`, `m:setMediaCachePath`, `m:share`, `m:sync`, `m:waitForCurrentReflectionToComplete`, `p:isAdministrator`

## qe.Sequence (Object)

`m:addEventListener`, `m:addTracks`, `m:close`, `m:deletePreviewFiles`, `m:dispatchEvent`, `m:exportDirect`, `m:exportFrameDPX`, `m:exportFrameJPEG`, `m:exportFramePNG`, `m:exportFrameTIFF`, `m:exportFrameTarga`, `m:exportToAME`, `m:extract`, `m:flushCache`, `m:getAudioTrackAt`, `m:getEmptyBarTimes`, `m:getExportComplete`, `m:getExportFileExtension`, `m:getGreenBarTimes`, `m:getRedBarTimes`, `m:getVideoTrackAt`, `m:getYellowBarTimes`, `m:isIncompleteBackgroundVideoEffects`, `m:isOpen`, `m:left`, `m:lockTracks`, `m:makeCurrent`, `m:muteTracks`, `m:razor`, `m:removeAudioTrack`, `m:removeEmptyAudioTracks`, `m:removeEmptyVideoTracks`, `m:removeEventListener`, `m:removeTracks`, `m:removeVideoTrack`, `m:renderAll`, `m:renderAudio`, `m:renderPreview`, `m:setAudioDisplayFormat`, `m:setAudioFrameRate`, `m:setCTI`, `m:setInOutPoints`, `m:setInPoint`, `m:setOutPoint`, `m:setPreviewFrameSize`, `m:setPreviewPresetPath`, `m:setUseMaxBitDepth`, `m:setUseMaxRenderQuality`, `m:setVideoDisplayFormat`, `m:setVideoFrameSize`, `m:setWorkInOutPoints`, `m:setWorkInPoint`, `m:setWorkOutPoint`, `m:syncLockTracks`, `p:CTI`, `p:audioDisplayFormat`, `p:audioFrameRate`, `p:editingMode`, `p:fieldType`, `p:guid`, `p:inPoint`, `p:multicam`, `p:name`, `p:numAudioTracks`, `p:numVideoTracks`, `p:outPoint`, `p:par`, `p:player`, `p:presetList`, `p:previewPresetCodec`, `p:previewPresetPath`, `p:useMaxBitDepth`, `p:useMaxRenderQuality`, `p:videoDisplayFormat`, `p:videoFrameRate`, `p:workInPoint`, `p:workOutPoint`

## qe.Track(video) (QETrack)

`m:addAudioEffect`, `m:getComponentAt`, `m:getItemAt`, `m:getTransitionAt`, `m:insert`, `m:isLocked`, `m:isMuted`, `m:isSyncLocked`, `m:overwrite`, `m:razor`, `m:setLock`, `m:setMute`, `m:setName`, `m:setSyncLock`, `p:id`, `p:index`, `p:name`, `p:numComponents`, `p:numItems`, `p:numTransitions`, `p:type`

## qe.TrackItem(video) (QETrackItem)

`m:addAudioEffect`, `m:addTransition`, `m:addVideoEffect`, `m:canDoMulticam`, `m:getClipPanComponent`, `m:getComponentAt`, `m:getProjectItem`, `m:move`, `m:moveToTrack`, `m:remove`, `m:removeEffects`, `m:rippleDelete`, `m:roll`, `m:setAntiAliasQuality`, `m:setBorderColor`, `m:setBorderWidth`, `m:setEndPercent`, `m:setEndPosition`, `m:setFrameBlend`, `m:setMulticam`, `m:setName`, `m:setReverse`, `m:setScaleToFrameSize`, `m:setSpeed`, `m:setStartPercent`, `m:setStartPosition`, `m:setSwitchSources`, `m:setTimeInterpolationType`, `m:slide`, `m:slip`, `p:alignment`, `p:antiAliasQuality`, `p:borderColor`, `p:borderWidth`, `p:duration`, `p:end`, `p:endPercent`, `p:frameBlend`, `p:mediaType`, `p:multicamEnabled`, `p:name`, `p:numComponents`, `p:reverse`, `p:reversed`, `p:scaleToFrameSize`, `p:speed`, `p:start`, `p:startPercent`, `p:staticClipGain`, `p:switchSources`, `p:timeInterpolationType`, `p:type`

## qe.Component (QEComponent)

`m:getParamControlValue`, `m:getParamKeyframes`, `m:getParamList`, `m:getParamValue`, `m:remove`, `m:setParamValue`, `p:id`, `p:matchName`, `p:name`

## qe.ComponentParam (ERR)

`ReferenceError: qi.getComponentAt().getParamAt is not a function`

## qe.ProjectItem (ERR)

`Error: Unknown error exception`

## qe.VideoEffect (QEVideoEffect)

`p:name`

## qe.VideoTransition (QEVideoTransition)

`p:name`

## qe.AudioTransition (QEAudioTransition)

`p:name`

## Video effects (qe.project.getVideoEffectList): 224

Color Replace, Gamma Correction, Extract, Color Pass, Lens Distortion, Levels, VR Sharpen, Metadata & Timecode Burn-in, VR Plane to Sphere, VR Blur, Lumetri Color, Video Limiter, Auto Reframe, VR Digital Glitch, VR De-Noise, VR Rotate Sphere, VR Color Gradients, Mask2, SDR Conform, VR Chromatic Aberrations, VR Fractal Noise, VR Glow, Mask, ASC CDL, Shape, Group, Vector Motion, Warp Stabilizer, Drop Shadow, Text, Sony RAW MXF Source Settings, RED Source Settings, PRORES RAW Source Settings, Twirl, Color Space Transform, Turbulent Displace, Camera Blur, VR Projection, Ultra Key, Track Matte Key, Transform, Transform, Luma Key, Noise (Legacy), Noise (Legacy), 4-Color Gradient, Color Emboss, Sharpen, Block Dissolve, Offset, Timecode, Motion, Sony Raw Source Settings, Directional Blur (Legacy), Spherize, ARRIRAW Development Settings, Roughen Edges, Replicate, Ramp, Tint, MPEG Source Settings, Brush Strokes, Basic 3D, Opacity, Canon Cinema RAW Light Source Settings, Brightness & Contrast, Edge Feather, Clip Name, Crop, Color Key, Alpha Adjust, Corner Pin, ProcAmp, Mosaic (Legacy), Strobe Light, Pixel Motion Blur, Rolling Shutter Repair, Timewarp, Invert, Cineon Converter, Gradient Wipe (Legacy), Alpha Glow, Wave Warp, Posterize, HSL Mask, Lightning, Vertical Flip, Unsharp Mask, Echo, Mirror, MXF/ARRIRAW Development Settings, Lens Flare, Black & White, Magnify (Legacy), Simple Text, Linear Wipe (Legacy), Horizontal Flip, Posterize Time, Find Edges, Lighting Effects, Gaussian Blur (Legacy), Fast Blur, Reduce Interlace Flicker, Logo Cutout, Auto Align, Gaussian Blur, Bokeh Blur, Camera Shake, Channel Blur, Channel Mix, Clone, Compound Blur, Rounded Crop, Directional Blur, Echo Glow, Edge Glow, Focus Blur, Glint, Gradient, Grow, Light Leaks, Long Shadow, Magnify, Mosaic, Move, Noise, RGB Split, 3D Rotate, Shrink, Spacer, Spin, Stroke, Vignette, Volumetric Rays, Wiggle, Wonder Glow, BRAW Studio Source Settings, Blackmagic RAW, Looks, Parametric Curve, Colorista V, Cosmo II, Denoiser III, Film, Mojo II, Renoiser, uni.Blur, uni.Bokeh, uni.Compound Blur, uni.Spot Blur, uni.Finisher, uni.Fisheye Fixer, uni.Grain16, uni.OverLight, uni.ShrinkRay, uni.Camera Shake, uni.Chromatic Aberration, uni.Heatwave, uni.Picture in Picture, uni.Prism Displacement, uni.RGB Separation, uni.Custom Dither, uni.Fractal Background, uni.Gradient Ramp, uni.Soft Gradient Background, uni.Spectralicious, uni.Chromatic Glow, uni.Edge Glow, uni.Glimmer, uni.Glo Fi, uni.Glow, uni.Point Zoom, uni.Quantum, uni.Array Gun, uni.HUD Components, uni.Line, uni.Progresso, uni.Reframe, uni.Turbulence Noise, uni.Analog, uni.Carousel, uni.ChromaTown, uni.Electrify, uni.Error Diffuse Dither, uni.Glitch, uni.Halftone Dither, uni.Holomatrix II, uni.Knoll Light Factory EZ, uni.MisFire, uni.Multitone, uni.Noir, uni.Ordered Dither, uni.RetroGrade, uni.Sketchify, uni.Symbol Mapper, uni.Texturize, uni.Texturize Motion, uni.Threshold Dither, uni.VHS, uni.AV Club, uni.Ecto, uni.Glo Fi II, uni.Hacker Text, uni.Long Shadow, uni.Luster, uni.Numbers, uni.Screen Text, uni.Text Tile, uni.Title Motion, uni.Type Cast, uni.Type On, uni.Typographic, uni.Logo Motion, uni.Modes, uni.Palettes, uni.Socialize, uni.Unmult, Chromatic Displacement, Real Lens Flares, Optical Glow, Primatte Keyer 6, 3D Stroke, Shine, Starglow

## Audio effects (qe.project.getAudioEffectList): 94

Automatic Click Remover, DeHummer, Parametric Equalizer, Adaptive Noise Reduction, Amplify, Analog Delay, Channel Mixer, Chorus/Flanger, Convolution Reverb, DeEsser, Distortion, Dynamics Processing, FFT Filter, Flanger, Graphic Equalizer (10 Bands), Graphic Equalizer (20 Bands), Graphic Equalizer (30 Bands), GuitarSuite, Hard Limiter, Loudness Meter, Loudness Radar, Mastering, Balance, Bandpass, Simple Notch Filter, Bass, Delay, Multitap Delay, Highpass, Invert, Lowpass, Mute, Simple Parametric EQ, Swap Channels, Fill Left with Right, Fill Right with Left, Treble, Volume, Channel Volume, Multiband Compressor, Notch Filter, Dynamics, Phaser, Pitch Shifter, Scientific Filter, Single-band Compressor, Tube-modeled Compressor, Stereo Expander, Studio Reverb, Surround Reverb, Vocal Enhancer, DeNoise, DeReverb, Neutron 4 Compressor, Neutron 4 Equalizer, Neutron 4 Exciter, Neutron 4 Gate, Neutron 4 Sculptor, Neutron 4 Transient Shaper, Neutron 4 Unmask, Neutron 4 Visual Mixer, Neutron 4, Neutron 4 Compressor, Neutron 4 Equalizer, Neutron 4 Gate, Neutron 4, Neutron 4 Sculptor, Neutron 4 Transient Shaper, Neutron 4 Unmask, Neutron 4 Visual Mixer, Neutron 4 Exciter, AUBandpass, AUDynamicsProcessor, AUDelay, AUDistortion, AUFilter, AUGraphicEQ, AUHipass, AUHighShelfFilter, AUPeakLimiter, AULowpass, AULowShelfFilter, AUMultibandCompressor, AUMatrixReverb, AUNBandEQ, AUNetSend, AUNewPitch, AUParametricEQ, AURoundTripAAC, AURogerBeep, AUReverb2, AUSampleDelay, AUPitch, AUSoundIsolation

## Video transitions (qe.project.getVideoTransitionList): 144

Additive Dissolve (Legacy), Cross Dissolve (Legacy), Cross Zoom (Legacy), Dip to Black (Legacy), Dip to White (Legacy), Film Dissolve (Legacy), Iris Cross, Iris Diamond, Iris Round, Iris Box, Page Turn, Push (Legacy), Slide (Legacy), Wipe, VR Random Blocks, VR Light Rays, VR Chroma Leaks, VR Iris Wipe, VR Mobius Zoom, VR Spherical Blur, VR Gradient Wipe, Morph Cut, VR Light Leaks, Radial Wipe (Legacy), Clock Wipe (Legacy), Split (Legacy), Dip to White (Legacy), Dip to Black (Legacy), Barn Doors, Inset, Whip (Legacy), Page Peel (Obsolete), Center Split, Non-Additive Dissolve, Cross Dissolve (Legacy), Louver, Block Motion, Flip Motion, 3D Roll, 3D Spin, Additive Dissolve, Blur Dissolve, Burn Alpha, Burn Chroma, Travel Motion, Chaos, Chroma Leak, Clock Wipe, Cross Dissolve, Cross Zoom, Dip to Black, Dip to Color, Dip to White, Directional Blur, Earthquake, Film Dissolve, Film Roll, Flare, Flash, Flicker, Fold Motion, Frame, Glass, Glitch, Glow, Grunge, Kaleidoscope, Lens Blur, Light Leak, Light Sweep, Linear Wipe, Liquid Distortion, Luma Fade, Mirror, Mosaic, Motion Camera, Motion Tween, Neon Wipe, Page Peel, Panel Wipe, Phosphor, Plateau Wipe, Pop Motion, Pull Motion, Push, Radial Blur, Radial Wipe, Ray, Roll, Shape Dissolve, Shape Flow, Slice, Slide, Solarize, Spin Motion, 3D Spinback, Split, Spring Motion, Star Wipe, Stretch Wipe, Stretch, Stripe, TV Power, Text Animator, Typewriter, VHS Damage, Wave, Whip, Soft Wipe, Zoom Blur, uni.Blinds, uni.Bokeh Transition, uni.Camera Shake Transition, uni.Carousel Transition, uni.Channel Blur, uni.Channel Surf, uni.Clock Wipe, uni.Color Mosaic Transition, uni.Color Stripe, uni.Cube, uni.Diamond Wave, uni.Dolly Fade, uni.Exposure Blur, uni.Film Transition, uni.Flicker Cut, uni.Fold, uni.Glitch Transition, uni.HalfLight, uni.Inside Cube, uni.Knoll Light Transition, uni.Linear Wipe, uni.RetroGrade Transition, uni.Rubix Cube, uni.Shape Wipe, uni.Slide, uni.Soft Edge Wipe, uni.Spectralicious Transition, uni.Stretch, uni.Swish Pan, uni.Triangle Wave, uni.Turbulence Transition, uni.Unfold, uni.VHS Transition, uni.Warp

## Audio transitions (qe.project.getAudioTransitionList): 3

Constant Power, Constant Gain, Exponential Fade

# Premiere 26 command ids and default shortcuts

All 1231 command ids Premiere 26 registers for keyboard shortcuts (the default English set as Premiere writes it, 264 bound by default), with the default key where one is bound (Mac names: Cmd, Opt, Shift, Ctrl). A trailing bracket is the context the key applies in (timeline, project, monitor...); none means global.

**None of these can be invoked from a panel.** premiere-map proved the native dispatcher (`invokeCommandByName`) is never exposed to CEP or UXP. A command id is therefore either an editor's click or a keystroke. Use this list to (1) name the exact default shortcut when you ask the editor to do something, and (2) know that a feature exists in Premiere at all before proposing a workaround. The editor's own set may differ; `premiere_shortcut` reads their current bindings.

## audioclipmixer (2)

- `cmd.audioclipmixer.automationmodelatch` [audioclipmixer]
- `cmd.audioclipmixer.automationmodetouch` [audioclipmixer]

## audiomixer (14)

- `cmd.audiomixer.audiounits` [audiomixer]
- `cmd.audiomixer.copytrackeffects` [audiomixer]
- `cmd.audiomixer.edit` [audiomixer]
- `cmd.audiomixer.effectsafe` [audiomixer]
- `cmd.audiomixer.fadersafe` [audiomixer]
- `cmd.audiomixer.loop` — Cmd+L [audiomixer]
- `cmd.audiomixer.meterinput` — Ctrl+Shift+I [audiomixer]
- `cmd.audiomixer.pannersafe` [audiomixer]
- `cmd.audiomixer.pastetrackeffects` [audiomixer]
- `cmd.audiomixer.post` [audiomixer]
- `cmd.audiomixer.pre` [audiomixer]
- `cmd.audiomixer.sendsafe` [audiomixer]
- `cmd.audiomixer.showhidetracks` — Opt+Cmd+T [audiomixer]
- `cmd.audiomixer.touchafterwrite` [audiomixer]

## caption (5)

- `cmd.caption.add.track`
- `cmd.caption.add.trackitem`
- `cmd.caption.edit.merge`
- `cmd.caption.edit.split`
- `cmd.caption.edit.trackitem`

## clear (3)

- `cmd.clear.in` — Opt+I
- `cmd.clear.inandout` — Opt+X
- `cmd.clear.out` — Opt+O

## clip (82)

- `clip.replaceclip.frombin`
- `clip.replaceclip.fromsourcemonitor`
- `clip.replaceclip.fromsourcemonitor.matchframe`
- `cmd.clip.adjustmentlayer`
- `cmd.clip.aeify`
- `cmd.clip.attachhires` [project]
- `cmd.clip.attachproxy` [project]
- `cmd.clip.audiocategorization`
- `cmd.clip.audiooptions.breakouttomono`
- `cmd.clip.audiooptions.enhancespeech`
- `cmd.clip.audiooptions.gain` — G
- `cmd.clip.audiooptions.nudgevolumedown`
- `cmd.clip.audiooptions.nudgevolumedown3`
- `cmd.clip.audiooptions.nudgevolumeup`
- `cmd.clip.audiooptions.nudgevolumeup3`
- `cmd.clip.audiooptions.sourcechannelmappings` — Shift+G
- `cmd.clip.autocolor`
- `cmd.clip.autodub`
- `cmd.clip.clipsettings`
- `cmd.clip.create.multicam`
- `cmd.clip.createproxies` [project]
- `cmd.clip.deleteeffects`
- `cmd.clip.detachproxy` [project]
- `cmd.clip.disable.masterclipeffects`
- `cmd.clip.editoffline`
- `cmd.clip.editsubclip`
- `cmd.clip.enable` — Shift+Cmd+E
- `cmd.clip.enableenhancespeech`
- `cmd.clip.extractaudio`
- `cmd.clip.fillframe`
- `cmd.clip.fittoframe`
- `cmd.clip.frameblend`
- `cmd.clip.framesample`
- `cmd.clip.generatepeakfile`
- `cmd.clip.group` — Cmd+G
- `cmd.clip.ignoretranscript` [timeline]
- `cmd.clip.insert` — ,
- `cmd.clip.keyframe.addremoveaudio`
- `cmd.clip.keyframe.addremovevideo`
- `cmd.clip.keyframe.decreaseaudiovalue`
- `cmd.clip.keyframe.decreasevideovalue`
- `cmd.clip.keyframe.increaseaudiovalue`
- `cmd.clip.keyframe.increasevideovalue`
- `cmd.clip.keyframe.moveaudiooneframeearlier`
- `cmd.clip.keyframe.moveaudiooneframelater`
- `cmd.clip.keyframe.moveaudiotenframesearlier`
- `cmd.clip.keyframe.moveaudiotenframeslater`
- `cmd.clip.keyframe.movevideooneframeearlier`
- `cmd.clip.keyframe.movevideooneframelater`
- `cmd.clip.keyframe.movevideotenframesearlier`
- `cmd.clip.keyframe.movevideotenframeslater`
- `cmd.clip.keyframe.selectnext`
- `cmd.clip.keyframe.selectprevious`
- `cmd.clip.linkaudioandvideo` — Cmd+L
- `cmd.clip.makesubclip` — Cmd+U
- `cmd.clip.merge`
- `cmd.clip.multicam.flatten`
- `cmd.clip.multicam.toggle`
- `cmd.clip.nestify`
- `cmd.clip.openstockaudiosearch`
- `cmd.clip.opticalflow`
- `cmd.clip.overlay` — .
- `cmd.clip.remix.enable`
- `cmd.clip.remix.properties`
- `cmd.clip.remix.revert`
- `cmd.clip.remix.splitintosegments`
- `cmd.clip.rename` [project]
- `cmd.clip.renderandreplace`
- `cmd.clip.replacefootage`
- `cmd.clip.restorecaptions`
- `cmd.clip.restoreunrendered`
- `cmd.clip.scaletoframesize`
- `cmd.clip.shotcut`
- `cmd.clip.speed` — Cmd+R
- `cmd.clip.synchronizeclips`
- `cmd.clip.transcribeasset`
- `cmd.clip.ungroup` — Shift+Cmd+G
- `cmd.clip.updatemetadata` [project]
- `cmd.clip.videooptions.addframehold`
- `cmd.clip.videooptions.field`
- `cmd.clip.videooptions.frameholdoptions`
- `cmd.clip.videooptions.insertframeholdsegment`

## color (18)

- `cmd.color.autorefresh` [color]
- `cmd.color.autotone` [color]
- `cmd.color.exportcube` [color]
- `cmd.color.exportlook` [color]
- `cmd.color.highdynamicrange` [color]
- `cmd.color.hslkeyblues` [color]
- `cmd.color.hslkeycyans` [color]
- `cmd.color.hslkeygreens` [color]
- `cmd.color.hslkeylumaonly` [color]
- `cmd.color.hslkeymagentas` [color]
- `cmd.color.hslkeyreds` [color]
- `cmd.color.hslkeyreset` [color]
- `cmd.color.hslkeyyellows` [color]
- `cmd.color.resettone` [color]
- `cmd.color.savepreset` [color]
- `cmd.color.solomode` [color]
- `cmd.color.togglelumetribypass` [color]
- `cmd.color.togglemasterclip` [color]

## common (2)

- `cmd.common.setin` — I
- `cmd.common.setout` — O

## conform (1)

- `cmd.conform`

## controlsurface (1)

- `cmd.controlsurface.toggleclipmixermode`

## edit (64)

- `cmd.edit.auditionmultitrack`
- `cmd.edit.clear` — Delete / ForwardDelete [effectcontrols, effects, history, project, timeline]
- `cmd.edit.copy` — Cmd+C
- `cmd.edit.cut` — Cmd+X
- `cmd.edit.deselectall` — Shift+Cmd+A
- `cmd.edit.duplicate` — Shift+Cmd+<
- `cmd.edit.editinaudition`
- `cmd.edit.editinphotoshop`
- `cmd.edit.editoriginal` — Cmd+E
- `cmd.edit.editsmartbin` [project]
- `cmd.edit.enablespellcheck`
- `cmd.edit.find` — Cmd+F [project]
- `cmd.edit.findnext`
- `cmd.edit.hide` [project]
- `cmd.edit.keyboardshortcuts` — Opt+Cmd+K
- `cmd.edit.label.0`
- `cmd.edit.label.1`
- `cmd.edit.label.10`
- `cmd.edit.label.11`
- `cmd.edit.label.12`
- `cmd.edit.label.13`
- `cmd.edit.label.14`
- `cmd.edit.label.15`
- `cmd.edit.label.2`
- `cmd.edit.label.3`
- `cmd.edit.label.4`
- `cmd.edit.label.5`
- `cmd.edit.label.6`
- `cmd.edit.label.7`
- `cmd.edit.label.8`
- `cmd.edit.label.9`
- `cmd.edit.labelgroup`
- `cmd.edit.license`
- `cmd.edit.paste` — Cmd+V [timeline]
- `cmd.edit.pasteattributes` — Opt+Cmd+V
- `cmd.edit.pasteinsert` — Shift+Cmd+V [timeline]
- `cmd.edit.preferences.audio`
- `cmd.edit.preferences.audiohardware`
- `cmd.edit.preferences.audioplugins`
- `cmd.edit.preferences.autosaveundo`
- `cmd.edit.preferences.collaboration`
- `cmd.edit.preferences.color`
- `cmd.edit.preferences.controlsurface`
- `cmd.edit.preferences.general` — Cmd+, [effects]
- `cmd.edit.preferences.labelcolors`
- `cmd.edit.preferences.labeldefaults`
- `cmd.edit.preferences.media`
- `cmd.edit.preferences.mediacache`
- `cmd.edit.preferences.memory`
- `cmd.edit.preferences.playback`
- `cmd.edit.preferences.scratchdisks`
- `cmd.edit.preferences.timeline`
- `cmd.edit.preferences.titler`
- `cmd.edit.preferences.transcription`
- `cmd.edit.preferences.trim` — Shift+T
- `cmd.edit.preferences.userinterface`
- `cmd.edit.redo` — Shift+Cmd+Z
- `cmd.edit.revealinproject` [timeline]
- `cmd.edit.revealoriginal` [project]
- `cmd.edit.rippledelete` — Shift+ForwardDelete
- `cmd.edit.selectall` — Cmd+A
- `cmd.edit.selectallmatching`
- `cmd.edit.spellchecksettings`
- `cmd.edit.undo` — Cmd+Z

## effectcontrols (49)

- `cmd.effectcontrols.aeeditabletextexpander` [effectcontrols]
- `cmd.effectcontrols.audio.sample.mode` [effectcontrols]
- `cmd.effectcontrols.audioexpander` [effectcontrols]
- `cmd.effectcontrols.delete.all.effects` [effectcontrols]
- `cmd.effectcontrols.effects.enabled` [effectcontrols]
- `cmd.effectcontrols.fadeshapetype.cosine` [effectcontrols]
- `cmd.effectcontrols.fadeshapetype.log` [effectcontrols]
- `cmd.effectcontrols.filter.edited`
- `cmd.effectcontrols.filter.keyframed`
- `cmd.effectcontrols.filter.none`
- `cmd.effectcontrols.interpolation.bezier` [effectcontrols]
- `cmd.effectcontrols.interpolation.bezier.auto` [effectcontrols]
- `cmd.effectcontrols.interpolation.bezier.continuous` [effectcontrols]
- `cmd.effectcontrols.interpolation.easein` [effectcontrols]
- `cmd.effectcontrols.interpolation.easeout` [effectcontrols]
- `cmd.effectcontrols.interpolation.hold` [effectcontrols]
- `cmd.effectcontrols.interpolation.linear` [effectcontrols]
- `cmd.effectcontrols.interpolation.spatial.bezier` [effectcontrols]
- `cmd.effectcontrols.interpolation.spatial.bezier.auto` [effectcontrols]
- `cmd.effectcontrols.interpolation.spatial.bezier.continuous` [effectcontrols]
- `cmd.effectcontrols.interpolation.spatial.linear` [effectcontrols]
- `cmd.effectcontrols.keyframes.clearall` [effectcontrols]
- `cmd.effectcontrols.loop.audio` — Cmd+L [effectcontrols]
- `cmd.effectcontrols.masterclipaudioexpander` [effectcontrols]
- `cmd.effectcontrols.masterclipvideoexpander` [effectcontrols]
- `cmd.effectcontrols.next.filter`
- `cmd.effectcontrols.opacity.blend.difference`
- `cmd.effectcontrols.opacity.blend.normal`
- `cmd.effectcontrols.pin.to.clip` [effectcontrols]
- `cmd.effectcontrols.rename` [effectcontrols]
- `cmd.effectcontrols.save.preset` [effectcontrols]
- `cmd.effectcontrols.snap.to.all` [effectcontrols]
- `cmd.effectcontrols.snap.to.audio` [effectcontrols]
- `cmd.effectcontrols.snap.to.clip` [effectcontrols]
- `cmd.effectcontrols.snap.to.cti` [effectcontrols]
- `cmd.effectcontrols.snap.to.none` [effectcontrols]
- `cmd.effectcontrols.snap.to.sequence.markers` [effectcontrols]
- `cmd.effectcontrols.snap.to.video` [effectcontrols]
- `cmd.effectcontrols.softness.high` [effectcontrols]
- `cmd.effectcontrols.softness.low` [effectcontrols]
- `cmd.effectcontrols.softness.medium` [effectcontrols]
- `cmd.effectcontrols.softness.off` [effectcontrols]
- `cmd.effectcontrols.toggle.snapping` [effectcontrols]
- `cmd.effectcontrols.toggletimerulernumbers` [effectcontrols]
- `cmd.effectcontrols.txalign.center` [effectcontrols]
- `cmd.effectcontrols.txalign.custom` [effectcontrols]
- `cmd.effectcontrols.txalign.end` [effectcontrols]
- `cmd.effectcontrols.txalign.start` [effectcontrols]
- `cmd.effectcontrols.videoexpander` [effectcontrols]

## effects (7)

- `cmd.effects.createcustomfolder` — Cmd+< [effects]
- `cmd.effects.createpresetfolder` [effects]
- `cmd.effects.export.preset` [effects]
- `cmd.effects.import.preset` [effects]
- `cmd.effects.preset.dynamicpreview` [effects]
- `cmd.effects.preset.properties` [effects]
- `cmd.effects.setdefaulttransition` [effects]

## essentialsound (1)

- `cmd.essentialsound.solomode` [essentialsound]

## export (1)

- `cmd.export.frame` — Shift+E

## file (67)

- `cmd.file.batchcapture` — F6
- `cmd.file.capture` — F5
- `cmd.file.close` — Shift+Cmd+W
- `cmd.file.closeall`
- `cmd.file.closeallother`
- `cmd.file.closepanel` — Cmd+W
- `cmd.file.colorproperties`
- `cmd.file.ea.browseautosaves`
- `cmd.file.ea.browseversions`
- `cmd.file.ea.convertproduction`
- `cmd.file.ea.convertproject`
- `cmd.file.ea.hostedcollaborationonly`
- `cmd.file.ea.publish`
- `cmd.file.ea.resolve`
- `cmd.file.ea.sync`
- `cmd.file.exit` — Cmd+Q
- `cmd.file.export.captions`
- `cmd.file.export.markers`
- `cmd.file.export.movie` — Cmd+M
- `cmd.file.export.project`
- `cmd.file.export.sendtoqueue` — Opt+Shift+M
- `cmd.file.export.toedl`
- `cmd.file.export.toomf`
- `cmd.file.export.totape`
- `cmd.file.export.totape.serial`
- `cmd.file.import` — Cmd+I
- `cmd.file.importaecomp`
- `cmd.file.importfrombrowser` — Opt+Cmd+I
- `cmd.file.interpretfootage`
- `cmd.file.new.adjustmentlayer`
- `cmd.file.new.bin` — Cmd+< / Cmd+B [project]
- `cmd.file.new.empty.project`
- `cmd.file.new.linkedproduction`
- `cmd.file.new.offlinefile`
- `cmd.file.new.photoshopfile`
- `cmd.file.new.production`
- `cmd.file.new.project` — Opt+Cmd+N
- `cmd.file.new.secondary.project`
- `cmd.file.new.sequence` — Cmd+N
- `cmd.file.new.sharedproject`
- `cmd.file.new.smartbin` [project]
- `cmd.file.new.textstyle` [project]
- `cmd.file.newaecomp`
- `cmd.file.newbinfromselection` [project]
- `cmd.file.open.sharedproject`
- `cmd.file.openinclipmode` [csxshandler]
- `cmd.file.openproduction`
- `cmd.file.openproject` — Cmd+O
- `cmd.file.openrushprojectbrowserdlg`
- `cmd.file.project.revealsystem` [project]
- `cmd.file.properties.file`
- `cmd.file.properties.selection` — Shift+Cmd+H
- `cmd.file.prproductionfolder.close`
- `cmd.file.prproductionfolder.new`
- `cmd.file.prproductionfolder.open`
- `cmd.file.refreshall`
- `cmd.file.revealsystem`
- `cmd.file.revert`
- `cmd.file.save` — Cmd+S
- `cmd.file.saveall`
- `cmd.file.saveas` — Shift+Cmd+S
- `cmd.file.saveastemplate`
- `cmd.file.savecopy` — Opt+Cmd+S
- `cmd.file.sharedmediavolumes`
- `cmd.file.timecode`
- `cmd.file.timedisplay`
- `cmd.file.vrproperties`

## fireflymaskpath (3)

- `cmd.fireflymaskpath.delete` [Properties2]
- `cmd.fireflymaskpath.duplicate` [Properties2]
- `cmd.fireflymaskpath.rename` [Properties2]

## goto (2)

- `cmd.goto.in` — Shift+I
- `cmd.goto.out` — Shift+O

## graphics (49)

- `cmd.graphics.add.image`
- `cmd.graphics.add.shape.ellipse` — Opt+Cmd+T
- `cmd.graphics.add.shape.polygon`
- `cmd.graphics.add.shape.rectangle` — Opt+Cmd+R
- `cmd.graphics.add.text` — Cmd+T
- `cmd.graphics.add.text.vertical`
- `cmd.graphics.align.horz.max.asGrp`
- `cmd.graphics.align.horz.max.ofGrp`
- `cmd.graphics.align.horz.mid.asGrp`
- `cmd.graphics.align.horz.mid.ofGrp`
- `cmd.graphics.align.horz.min.asGrp`
- `cmd.graphics.align.horz.min.ofGrp`
- `cmd.graphics.align.vert.max.asGrp`
- `cmd.graphics.align.vert.max.ofGrp`
- `cmd.graphics.align.vert.mid.asGrp`
- `cmd.graphics.align.vert.mid.ofGrp`
- `cmd.graphics.align.vert.min.asGrp`
- `cmd.graphics.align.vert.min.ofGrp`
- `cmd.graphics.alignment.horizontal.center`
- `cmd.graphics.alignment.horizontal.left`
- `cmd.graphics.alignment.horizontal.right`
- `cmd.graphics.alignment.vertical.bottom`
- `cmd.graphics.alignment.vertical.center`
- `cmd.graphics.alignment.vertical.top`
- `cmd.graphics.clear` [Properties2]
- `cmd.graphics.dialog.replacefont`
- `cmd.graphics.distribute.horizontal.center`
- `cmd.graphics.distribute.horizontal.space`
- `cmd.graphics.distribute.vertical.center`
- `cmd.graphics.distribute.vertical.space`
- `cmd.graphics.enter.text.edit`
- `cmd.graphics.export.capsule`
- `cmd.graphics.install.mogrt`
- `cmd.graphics.move.graphic.layer.down` — Cmd+'
- `cmd.graphics.move.graphic.layer.to.bottom` — Shift+Cmd+'
- `cmd.graphics.move.graphic.layer.to.top` — Shift+Cmd+;
- `cmd.graphics.move.graphic.layer.up` — Cmd+;
- `cmd.graphics.open.EGP`
- `cmd.graphics.reset.all.parameters`
- `cmd.graphics.reset.duration`
- `cmd.graphics.select.next.graphic`
- `cmd.graphics.select.next.graphic.layer` — Opt+Cmd+;
- `cmd.graphics.select.previous.graphic`
- `cmd.graphics.select.previous.graphic.layer` — Opt+Cmd+'
- `cmd.graphics.set.intro.end`
- `cmd.graphics.set.outro.begin`
- `cmd.graphics.style.view.switch`
- `cmd.graphics.upgrade.caption.to.graphic`
- `cmd.graphics.upgrade.to.source`

## graphicsinspector (12)

- `cmd.graphicsinspector.aligncenter`
- `cmd.graphicsinspector.alignleft`
- `cmd.graphicsinspector.alignright`
- `cmd.graphicsinspector.allcaps`
- `cmd.graphicsinspector.fauxbold`
- `cmd.graphicsinspector.fauxitalic`
- `cmd.graphicsinspector.lefttoright`
- `cmd.graphicsinspector.righttoleft`
- `cmd.graphicsinspector.smallcaps`
- `cmd.graphicsinspector.subscript`
- `cmd.graphicsinspector.superscript`
- `cmd.graphicsinspector.underline`

## help (13)

- `cmd.help.about`
- `cmd.help.applicationoptimizer`
- `cmd.help.contents` — F1
- `cmd.help.genaiguidelines`
- `cmd.help.keyboard`
- `cmd.help.learning`
- `cmd.help.registration`
- `cmd.help.reveallogsfolder`
- `cmd.help.support`
- `cmd.help.systemcompatibilityreport`
- `cmd.help.updates`
- `cmd.help.uservoice`
- `cmd.help.welcome`

## history (4)

- `cmd.history.clearhistory` [history]
- `cmd.history.settings` [history]
- `cmd.history.step.backward` — Left [history]
- `cmd.history.step.forward` — Right [history]

## inspector (1)

- `cmd.inspector.reset`

## marker (54)

- `cmd.marker.add.0`
- `cmd.marker.add.1`
- `cmd.marker.add.2`
- `cmd.marker.add.3`
- `cmd.marker.add.4`
- `cmd.marker.add.5`
- `cmd.marker.add.6`
- `cmd.marker.add.7`
- `cmd.marker.autogeneratedvdmarekrs`
- `cmd.marker.cleardvdmarker.all`
- `cmd.marker.cleardvdmarker.current`
- `cmd.marker.clearmarker.all` — Opt+Cmd+M
- `cmd.marker.clearmarker.current` — Opt+M
- `cmd.marker.copypaste.includessequencemarkers`
- `cmd.marker.dvd.prev`
- `cmd.marker.edit`
- `cmd.marker.gotoclipmarker.audioin`
- `cmd.marker.gotoclipmarker.audioout`
- `cmd.marker.gotoclipmarker.videoin`
- `cmd.marker.gotoclipmarker.videoout`
- `cmd.marker.gotodvdmarker.next`
- `cmd.marker.gotomarker.next` — Shift+M
- `cmd.marker.gotomarker.previous` — Shift+Cmd+M
- `cmd.marker.ignoretimelineselection` [markerList]
- `cmd.marker.nextrow` [markerList]
- `cmd.marker.previousrow` [markerList]
- `cmd.marker.setchaptermarker`
- `cmd.marker.setchaptermarkerdialog`
- `cmd.marker.setclipmarker.audioin`
- `cmd.marker.setclipmarker.audiout`
- `cmd.marker.setclipmarker.videoin`
- `cmd.marker.setclipmarker.videoout`
- `cmd.marker.setcolor1`
- `cmd.marker.setcolor2`
- `cmd.marker.setcolor3`
- `cmd.marker.setcolor4`
- `cmd.marker.setcolor5`
- `cmd.marker.setcolor6`
- `cmd.marker.setcolor7`
- `cmd.marker.setcolor8`
- `cmd.marker.setdvdmarker`
- `cmd.marker.setflashcuemarker`
- `cmd.marker.setflashcuemarkerdialog`
- `cmd.marker.setsequenceinoutmarkeraroundselection.out` — <
- `cmd.marker.setsequenceinoutmarkeraroundtargetclip` — X
- `cmd.marker.setstopdvdmarker`
- `cmd.marker.show.allmarkers` [markerList]
- `cmd.marker.show.clipmarkers` [markerList]
- `cmd.marker.show.sequencemarkers` [markerList]
- `cmd.marker.showdvdmarkers`
- `cmd.marker.showinout` [markerList]
- `cmd.marker.showmarker.all`
- `cmd.marker.showmarkers`
- `cmd.marker.style.ripplesequencemarkers`

## mediabrowser (16)

- `cmd.mediabrowser.allowdupliates` [mediabrowser]
- `cmd.mediabrowser.clearrecentdirectories` [mediabrowser]
- `cmd.mediabrowser.createfolder` [mediabrowser]
- `cmd.mediabrowser.editcolumns` [mediabrowser]
- `cmd.mediabrowser.enablehover` [mediabrowser]
- `cmd.mediabrowser.favorites.add` [mediabrowser]
- `cmd.mediabrowser.favorites.remove` [mediabrowser]
- `cmd.mediabrowser.import` [mediabrowser]
- `cmd.mediabrowser.importstillsassequence` [mediabrowser]
- `cmd.mediabrowser.newfolder` — Cmd+B [prproduction]
- `cmd.mediabrowser.newpanel` [mediabrowser]
- `cmd.mediabrowser.open` [mediabrowser]
- `cmd.mediabrowser.openinsourcemonitor` — Shift+O [mediabrowser]
- `cmd.mediabrowser.refresh` [mediabrowser]
- `cmd.mediabrowser.selectdirectorylist` — Shift+Left [mediabrowser]
- `cmd.mediabrowser.selectmedialist` — Shift+Right [mediabrowser]

## menu (3)

- `menu.projectsettings`
- `menu.prproductionsettings`
- `menu.windows.browseaddons`

## metadataeditor (6)

- `cmd.metadataeditor.loop` — Cmd+L [metadata_editor]
- `cmd.metadataeditor.matchingword.next` [metadata_editor]
- `cmd.metadataeditor.matchingword.previous` [metadata_editor]
- `cmd.metadataeditor.play` — Space [metadata_editor]
- `cmd.metadataeditor.play.intoout` [metadata_editor]
- `cmd.metadataeditor.wingtip.metadatadisplay` [metadata_editor]

## monitor (106)

- `cmd.monitor.addcliptoproject` [source.monitor]
- `cmd.monitor.addguide` [program.monitor]
- `cmd.monitor.ambisonics.monitor.toggle` [program.monitor, source.monitor]
- `cmd.monitor.closeallclips` [source.monitor]
- `cmd.monitor.closeclip` [source.monitor]
- `cmd.monitor.colormanagement.ganged` [source.monitor]
- `cmd.monitor.colormanagement.off` [source.monitor]
- `cmd.monitor.colormanagement.on` [source.monitor]
- `cmd.monitor.fields.both` [program.monitor, source.monitor]
- `cmd.monitor.fields.first` [program.monitor, source.monitor]
- `cmd.monitor.fields.second` [program.monitor, source.monitor]
- `cmd.monitor.firstclip` [source.monitor]
- `cmd.monitor.force.media.refresh`
- `cmd.monitor.fx.mute` [program.monitor]
- `cmd.monitor.gang.source.and.program`
- `cmd.monitor.guide.edit` [program.monitor]
- `cmd.monitor.guides` [program.monitor]
- `cmd.monitor.lastclip` [source.monitor]
- `cmd.monitor.lockguides` [program.monitor]
- `cmd.monitor.loop`
- `cmd.monitor.manageguides` [program.monitor]
- `cmd.monitor.multicam.toggle` [source.monitor]
- `cmd.monitor.nextclip` [source.monitor]
- `cmd.monitor.nudge.down.five` — Shift+Cmd+Down [Graphics, Properties2, program.monitor]
- `cmd.monitor.nudge.down.one` — Cmd+Down [Graphics, Properties2, program.monitor]
- `cmd.monitor.nudge.left.five` — Shift+Cmd+Left [Graphics, Properties2, program.monitor]
- `cmd.monitor.nudge.left.one` — Cmd+Left [Graphics, Properties2, program.monitor]
- `cmd.monitor.nudge.right.five` — Shift+Cmd+Right [Graphics, Properties2, program.monitor]
- `cmd.monitor.nudge.right.one` — Cmd+Right [Graphics, Properties2, program.monitor]
- `cmd.monitor.nudge.up.five` — Shift+Cmd+Up [Graphics, Properties2, program.monitor]
- `cmd.monitor.nudge.up.one` — Cmd+Up [Graphics, Properties2, program.monitor]
- `cmd.monitor.output.alpha` [program.monitor, source.monitor]
- `cmd.monitor.output.blue` [program.monitor, source.monitor]
- `cmd.monitor.output.composite` [program.monitor, source.monitor]
- `cmd.monitor.output.green` [program.monitor, source.monitor]
- `cmd.monitor.output.red` [program.monitor, source.monitor]
- `cmd.monitor.output.zoom.10` [program.monitor, source.monitor]
- `cmd.monitor.output.zoom.100` [program.monitor, source.monitor]
- `cmd.monitor.output.zoom.150` [program.monitor, source.monitor]
- `cmd.monitor.output.zoom.1600` [program.monitor, source.monitor]
- `cmd.monitor.output.zoom.200` [program.monitor, source.monitor]
- `cmd.monitor.output.zoom.25` [program.monitor, source.monitor]
- `cmd.monitor.output.zoom.400` [program.monitor, source.monitor]
- `cmd.monitor.output.zoom.50` [program.monitor, source.monitor]
- `cmd.monitor.output.zoom.75` [program.monitor, source.monitor]
- `cmd.monitor.output.zoom.800` [program.monitor, source.monitor]
- `cmd.monitor.output.zoom.fit` [program.monitor, source.monitor]
- `cmd.monitor.outputaudiowaveform` [source.monitor]
- `cmd.monitor.outputmulticam` [program.monitor]
- `cmd.monitor.overlays`
- `cmd.monitor.paused.resolution.eighth` [program.monitor, source.monitor]
- `cmd.monitor.paused.resolution.full` [program.monitor, source.monitor]
- `cmd.monitor.paused.resolution.half` [program.monitor, source.monitor]
- `cmd.monitor.paused.resolution.quarter` [program.monitor, source.monitor]
- `cmd.monitor.paused.resolution.sixteenth` [program.monitor, source.monitor]
- `cmd.monitor.playback.qualityishigh` [program.monitor, source.monitor]
- `cmd.monitor.playback.resolution.eighth` [program.monitor, source.monitor]
- `cmd.monitor.playback.resolution.full` [program.monitor, source.monitor]
- `cmd.monitor.playback.resolution.half` [program.monitor, source.monitor]
- `cmd.monitor.playback.resolution.quarter` [program.monitor, source.monitor]
- `cmd.monitor.playback.resolution.sixteenth` [program.monitor, source.monitor]
- `cmd.monitor.playstoptoggle` — Space [program.monitor, source.monitor]
- `cmd.monitor.previousclip` [source.monitor]
- `cmd.monitor.program.multicam.edit.cameras` [program.monitor]
- `cmd.monitor.program.showscrollbars` [program.monitor]
- `cmd.monitor.program.showtransportcontrols` [program.monitor]
- `cmd.monitor.removeguides` [program.monitor]
- `cmd.monitor.ruler.percentages` [program.monitor]
- `cmd.monitor.ruler.pixels` [program.monitor]
- `cmd.monitor.rulers` [program.monitor]
- `cmd.monitor.saveguides` [program.monitor]
- `cmd.monitor.showtimecodeonvideo` [program.monitor]
- `cmd.monitor.snapping` [program.monitor]
- `cmd.monitor.source.multicam.edit.cameras` [source.monitor]
- `cmd.monitor.source.revealinproject` [source.monitor]
- `cmd.monitor.source.showscrollbars` [source.monitor]
- `cmd.monitor.source.showtransportcontrols` [source.monitor]
- `cmd.monitor.source.viewcaptionstream.enable` [source.monitor]
- `cmd.monitor.source.viewcaptionstream.stream1` [source.monitor]
- `cmd.monitor.source.viewcaptionstream.stream10` [source.monitor]
- `cmd.monitor.source.viewcaptionstream.stream2` [source.monitor]
- `cmd.monitor.source.viewcaptionstream.stream3` [source.monitor]
- `cmd.monitor.source.viewcaptionstream.stream4` [source.monitor]
- `cmd.monitor.source.viewcaptionstream.stream5` [source.monitor]
- `cmd.monitor.source.viewcaptionstream.stream6` [source.monitor]
- `cmd.monitor.source.viewcaptionstream.stream7` [source.monitor]
- `cmd.monitor.source.viewcaptionstream.stream8` [source.monitor]
- `cmd.monitor.source.viewcaptionstream.stream9` [source.monitor]
- `cmd.monitor.split.screen` [program.monitor]
- `cmd.monitor.step.backward` [program.monitor, source.monitor]
- `cmd.monitor.step.forward` [program.monitor, source.monitor]
- `cmd.monitor.timecodeoverlay` [program.monitor, source.monitor]
- `cmd.monitor.toggle.crop.dm`
- `cmd.monitor.toggleaudio` [program.monitor, source.monitor]
- `cmd.monitor.toggledroppedframeindicator` [program.monitor, source.monitor]
- `cmd.monitor.togglemarkers` [program.monitor, source.monitor]
- `cmd.monitor.togglesafearea` [program.monitor, source.monitor]
- `cmd.monitor.toggletimerulernumbers` [program.monitor, source.monitor]
- `cmd.monitor.toggletransparencygrid` [program.monitor, source.monitor]
- `cmd.monitor.tracks.0` [source.monitor]
- `cmd.monitor.view.sequences.in.timeline` [source.monitor]
- `cmd.monitor.view.trimsession.rollback`
- `cmd.monitor.vrviewer.minimalcontrols` [program.monitor, source.monitor]
- `cmd.monitor.vrviewer.settings` [program.monitor, source.monitor]
- `cmd.monitor.vrviewer.toggle` [program.monitor, source.monitor]
- `cmd.monitor.wingtip.safemargins` [program.monitor, source.monitor]

## multicam (47)

- `cmd.multicam.audio.follows.video`
- `cmd.multicam.choose.camera.1` — Ctrl+1
- `cmd.multicam.choose.camera.10`
- `cmd.multicam.choose.camera.11`
- `cmd.multicam.choose.camera.12`
- `cmd.multicam.choose.camera.13`
- `cmd.multicam.choose.camera.14`
- `cmd.multicam.choose.camera.15`
- `cmd.multicam.choose.camera.16`
- `cmd.multicam.choose.camera.2` — Ctrl+2
- `cmd.multicam.choose.camera.3` — Ctrl+3
- `cmd.multicam.choose.camera.4` — Ctrl+4
- `cmd.multicam.choose.camera.5` — Ctrl+5
- `cmd.multicam.choose.camera.6` — Ctrl+6
- `cmd.multicam.choose.camera.7` — Ctrl+7
- `cmd.multicam.choose.camera.8` — Ctrl+8
- `cmd.multicam.choose.camera.9` — Ctrl+9
- `cmd.multicam.choosenocut.camera1` — 1
- `cmd.multicam.choosenocut.camera10`
- `cmd.multicam.choosenocut.camera11`
- `cmd.multicam.choosenocut.camera12`
- `cmd.multicam.choosenocut.camera13`
- `cmd.multicam.choosenocut.camera14`
- `cmd.multicam.choosenocut.camera15`
- `cmd.multicam.choosenocut.camera16`
- `cmd.multicam.choosenocut.camera2` — 2
- `cmd.multicam.choosenocut.camera3` — 3
- `cmd.multicam.choosenocut.camera4` — 4
- `cmd.multicam.choosenocut.camera5` — 5
- `cmd.multicam.choosenocut.camera6` — 6
- `cmd.multicam.choosenocut.camera7` — 7
- `cmd.multicam.choosenocut.camera8` — 8
- `cmd.multicam.choosenocut.camera9` — 9
- `cmd.multicam.enable.auto.decimation` [program.monitor]
- `cmd.multicam.follows.nest.setting`
- `cmd.multicam.next.camera`
- `cmd.multicam.page.first`
- `cmd.multicam.page.last`
- `cmd.multicam.page.next`
- `cmd.multicam.page.previous`
- `cmd.multicam.previous.camera`
- `cmd.multicam.selection.top.down`
- `cmd.multicam.show.program` [program.monitor]
- `cmd.multicam.switch.camera.audio` [source.monitor]
- `cmd.multicam.toggle.multicam.view` — Shift+0
- `cmd.multicam.toggle.record` — 0
- `cmd.multicam.transmit.gridview`

## overlay (1)

- `cmd.overlay.settings`

## placeholder (1)

- `cmd.placeholder`

## posterframe (4)

- `cmd.posterframe.clear` — Opt+P
- `cmd.posterframe.move.backward`
- `cmd.posterframe.move.forward`
- `cmd.posterframe.set` — Cmd+P

## preview (1)

- `cmd.preview.yellowinbackground`

## project (97)

- `cmd.project.aligntogrid` [project]
- `cmd.project.aligntogridsorted` [project]
- `cmd.project.automatetosequence` [project]
- `cmd.project.bin.new.smartbin` [project]
- `cmd.project.consolidateduplicates`
- `cmd.project.contextmenu.new.smartbin` [project]
- `cmd.project.createsmartbinfromquery` [project]
- `cmd.project.deletewithoptions` — Cmd+ForwardDelete [project]
- `cmd.project.enablehover` — Shift+H [mediabrowser, project]
- `cmd.project.enableoverlaycontrols` [project]
- `cmd.project.export.textstyle` [project]
- `cmd.project.freeform.itemzoom.extralarge` [project]
- `cmd.project.freeform.itemzoom.large` [project]
- `cmd.project.freeform.itemzoom.medium` [project]
- `cmd.project.freeform.itemzoom.next` [project]
- `cmd.project.freeform.itemzoom.prev` [project]
- `cmd.project.freeform.itemzoom.small` [project]
- `cmd.project.freeformview.options` [project]
- `cmd.project.generatemasterclips`
- `cmd.project.goback` [project]
- `cmd.project.iconsort.ascending` [project]
- `cmd.project.iconsort.custom` [project]
- `cmd.project.iconsort.descending` [project]
- `cmd.project.iconsort.listvew` [project]
- `cmd.project.iconsort.toggle` [project]
- `cmd.project.item.addtosequence` [project]
- `cmd.project.item.open` [project]
- `cmd.project.linkmedia`
- `cmd.project.manage.view.presets` [project]
- `cmd.project.managesavedlayouts` [project]
- `cmd.project.move.down` — Down [project]
- `cmd.project.move.end` — End [project]
- `cmd.project.move.home` — Home [project]
- `cmd.project.move.pagedown` — PageDown [project]
- `cmd.project.move.pageup` — PageUp [project]
- `cmd.project.move.right` — Right [project]
- `cmd.project.move.up` — Up [project]
- `cmd.project.moveextend.down` — Shift+Down [project]
- `cmd.project.moveextend.left` — Shift+Left [project]
- `cmd.project.moveextend.right` — Shift+Right [project]
- `cmd.project.moveextend.up` — Shift+Up [project]
- `cmd.project.movel.eft` — Left [project]
- `cmd.project.next.thumbnail.size.large` — Shift+P [project]
- `cmd.project.nextcolumnfield` — Tab [project]
- `cmd.project.nextrowfield` — Return [project]
- `cmd.project.openinsource` — Shift+O [project]
- `cmd.project.openintimeline` [project]
- `cmd.project.previous.thumbnail.size.large` — Shift+key200 [project]
- `cmd.project.previouscolumnfield` — Shift+Tab [project]
- `cmd.project.previousrowfield` — Shift+Return [project]
- `cmd.project.projectmanager`
- `cmd.project.reassociatemasterclips`
- `cmd.project.removeunused`
- `cmd.project.save.newview.preset` [project]
- `cmd.project.save.view.preset` [project]
- `cmd.project.saveasnewlayout` [project]
- `cmd.project.savecurrentlayout` [project]
- `cmd.project.settings.color`
- `cmd.project.settings.general`
- `cmd.project.settings.ingestsettings`
- `cmd.project.settings.scratchdisks`
- `cmd.project.settingsviewer`
- `cmd.project.toggle.view` — Shift+' [project]
- `cmd.project.toggleproxies`
- `cmd.project.unlinkmedia`
- `cmd.project.view.preset.0` [project]
- `cmd.project.view.preset.1` [project]
- `cmd.project.view.preset.2` [project]
- `cmd.project.view.preset.3` [project]
- `cmd.project.view.preset.4` [project]
- `cmd.project.view.preset.5` [project]
- `cmd.project.view.preset.6` [project]
- `cmd.project.view.preset.7` [project]
- `cmd.project.view.preset.8` [project]
- `cmd.project.view.preset.9` [project]
- `cmd.project.viewhidden` [project]
- `cmd.project.wingtip.closeproject` [project]
- `cmd.project.wingtip.fontsize.extralarge` [project]
- `cmd.project.wingtip.fontsize.large` [project]
- `cmd.project.wingtip.fontsize.medium` [project]
- `cmd.project.wingtip.fontsize.small` [project]
- `cmd.project.wingtip.metadatadisplay` [project]
- `cmd.project.wingtip.new.smartbin` [project]
- `cmd.project.wingtip.refresh` [project]
- `cmd.project.wingtip.refreshproject` [project]
- `cmd.project.wingtip.saveproject` [project]
- `cmd.project.wingtip.thumbnail.shows.effects` [project]
- `cmd.project.wingtip.thumbnails.large` [project]
- `cmd.project.wingtip.thumbnails.medium` [project]
- `cmd.project.wingtip.thumbnails.off` [project]
- `cmd.project.wingtip.thumbnails.small` [project]
- `cmd.project.wingtip.view.freeform` [project]
- `cmd.project.wingtip.view.icon` — Cmd+PageDown [project]
- `cmd.project.wingtip.view.list` — Cmd+PageUp [project]
- `cmd.project.wingtip.view.preview` [project]
- `cmd.project.zoom.in` [project]
- `cmd.project.zoom.out` [project]

## proxies (1)

- `cmd.proxies.reveal.filesystem` [project]

## prproduction (4)

- `cmd.prproduction.settings.color`
- `cmd.prproduction.settings.general`
- `cmd.prproduction.settings.ingestsettings`
- `cmd.prproduction.settings.scratchdisks`

## prproductionfolder (22)

- `cmd.prproductionfolder.addproject` [prproduction]
- `cmd.prproductionfolder.closeallprojects` [prproduction]
- `cmd.prproductionfolder.closeproject` — Shift+Cmd+W [prproduction]
- `cmd.prproductionfolder.makeacopy` [prproduction]
- `cmd.prproductionfolder.move.end` — End [prproduction]
- `cmd.prproductionfolder.move.home` — Home [prproduction]
- `cmd.prproductionfolder.move.pagedown` — PageDown [prproduction]
- `cmd.prproductionfolder.move.pageup` — PageUp [prproduction]
- `cmd.prproductionfolder.movetotrash` — Cmd+Delete [prproduction]
- `cmd.prproductionfolder.newproject` — Opt+Cmd+N [prproduction]
- `cmd.prproductionfolder.openproject` — Cmd+O [prproduction]
- `cmd.prproductionfolder.refreshallprojects` [prproduction]
- `cmd.prproductionfolder.refreshproject` [prproduction]
- `cmd.prproductionfolder.renameitem` [prproduction]
- `cmd.prproductionfolder.renameproduction` [prproduction]
- `cmd.prproductionfolder.revealiteminsystem` [prproduction]
- `cmd.prproductionfolder.revealrootinsystem` [prproduction]
- `cmd.prproductionfolder.saveallprojects` [prproduction]
- `cmd.prproductionfolder.toggle.showpath` [prproduction]
- `cmd.prproductionfolder.togglelock` [prproduction]
- `cmd.prproductionfolder.zoomin` [prproduction]
- `cmd.prproductionfolder.zoomout` — - [prproduction]

## quickexport (1)

- `cmd.quickexport.open`

## roughcut (3)

- `cmd.roughcut.add51audiotrack`
- `cmd.roughcut.addmonoaudiotrack`
- `cmd.roughcut.addstereoaudiotrack`

## select (3)

- `cmd.select.find.box` — Shift+F
- `cmd.select.next.panel` — Ctrl+Shift+.
- `cmd.select.previous.panel` — Ctrl+Shift+,

## sequence (89)

- `cmd.sequence.addaudiosubmixtrack`
- `cmd.sequence.addtrack`
- `cmd.sequence.addtracks`
- `cmd.sequence.addvideotrack`
- `cmd.sequence.applydefaultaudiotransition` — Shift+Cmd+D
- `cmd.sequence.applydefaulttransitions` — Shift+D
- `cmd.sequence.applydefaultvideotransition` — Cmd+D
- `cmd.sequence.audiotrackoutputassignments`
- `cmd.sequence.autoframesequence`
- `cmd.sequence.caption.translatecaptions`
- `cmd.sequence.captiontracksettings`
- `cmd.sequence.close.gaps`
- `cmd.sequence.copytrackeffects`
- `cmd.sequence.customizetrackheaders`
- `cmd.sequence.decreaseclipvolume` — key210
- `cmd.sequence.decreaseclipvolumemany` — Shift+key210
- `cmd.sequence.deletetrack`
- `cmd.sequence.deletetracks`
- `cmd.sequence.deletetracks.empty`
- `cmd.sequence.deletevideopreviews`
- `cmd.sequence.deleteworkareavideopreviews`
- `cmd.sequence.edit.label.0` [timeline]
- `cmd.sequence.edit.label.1` [timeline]
- `cmd.sequence.edit.label.10` [timeline]
- `cmd.sequence.edit.label.11` [timeline]
- `cmd.sequence.edit.label.12` [timeline]
- `cmd.sequence.edit.label.13` [timeline]
- `cmd.sequence.edit.label.14` [timeline]
- `cmd.sequence.edit.label.15` [timeline]
- `cmd.sequence.edit.label.2` [timeline]
- `cmd.sequence.edit.label.3` [timeline]
- `cmd.sequence.edit.label.4` [timeline]
- `cmd.sequence.edit.label.5` [timeline]
- `cmd.sequence.edit.label.6` [timeline]
- `cmd.sequence.edit.label.7` [timeline]
- `cmd.sequence.edit.label.8` [timeline]
- `cmd.sequence.edit.label.9` [timeline]
- `cmd.sequence.extendnextedittoplayhead` — Shift+W
- `cmd.sequence.extendpreviousedittoplayhead` — Shift+Q
- `cmd.sequence.extendselectededittoplayhead` — E
- `cmd.sequence.extract` — '
- `cmd.sequence.findnextsequencegap` — Shift+'
- `cmd.sequence.findnexttrackgap`
- `cmd.sequence.findprevioussequencegap` — Opt+'
- `cmd.sequence.findprevioustrackgap`
- `cmd.sequence.generatecaptions`
- `cmd.sequence.increaseclipvolume` — key200
- `cmd.sequence.increaseclipvolumemany` — Shift+;
- `cmd.sequence.joinallthroughedits` [timeline]
- `cmd.sequence.jointhroughedits` [timeline]
- `cmd.sequence.lift` — ;
- `cmd.sequence.linkedselection`
- `cmd.sequence.makesubsequence` — Shift+U
- `cmd.sequence.makesubsequencefromintoout`
- `cmd.sequence.matchframe` — F
- `cmd.sequence.nestsourcesequence`
- `cmd.sequence.newsequencefromselection`
- `cmd.sequence.normalizetrack`
- `cmd.sequence.oneframeoffrippletrimpreviousedittoplayhead`
- `cmd.sequence.pastetrackeffects`
- `cmd.sequence.preview` — Return
- `cmd.sequence.previewaudio`
- `cmd.sequence.previewselection`
- `cmd.sequence.previewyellow`
- `cmd.sequence.razorateditline` — Cmd+K
- `cmd.sequence.razorateditline.all` — Shift+Cmd+K
- `cmd.sequence.renameaudiotrack`
- `cmd.sequence.renamevideotrack`
- `cmd.sequence.reversematchframe` — Shift+R
- `cmd.sequence.rippletrimnextedittoplayhead` — W
- `cmd.sequence.rippletrimpreviousedittoplayhead` — Q
- `cmd.sequence.selectionfollowsplayhead`
- `cmd.sequence.sequencesettingsgeneral`
- `cmd.sequence.setpancenter`
- `cmd.sequence.setpanleft`
- `cmd.sequence.setpanright`
- `cmd.sequence.showfxbadges`
- `cmd.sequence.showthroughedits`
- `cmd.sequence.simplifysequence`
- `cmd.sequence.snap`
- `cmd.sequence.splitclip`
- `cmd.sequence.toggletrimtype` — Ctrl+T
- `cmd.sequence.transcribeasset`
- `cmd.sequence.trim.restore`
- `cmd.sequence.trimbackward` — Opt+Left
- `cmd.sequence.trimbackwardmany` — Opt+Shift+Left
- `cmd.sequence.trimforward` — Opt+Right
- `cmd.sequence.trimforwardmany` — Opt+Shift+Right
- `cmd.sequence.voiceoversettingtrackheader`

## set (3)

- `cmd.set.marker` — M
- `cmd.set.rangedmarker`
- `cmd.set.rangedmarker.inandout`

## sourcepreview (2)

- `cmd.sourcepreview.nextitem`
- `cmd.sourcepreview.previousitem`

## timecode (38)

- `cmd.timecode.addline`
- `cmd.timecode.compactview`
- `cmd.timecode.fullsizeview`
- `cmd.timecode.managepresets`
- `cmd.timecode.preset.0`
- `cmd.timecode.preset.1`
- `cmd.timecode.preset.2`
- `cmd.timecode.preset.3`
- `cmd.timecode.preset.4`
- `cmd.timecode.preset.5`
- `cmd.timecode.preset.6`
- `cmd.timecode.preset.7`
- `cmd.timecode.preset.8`
- `cmd.timecode.preset.9`
- `cmd.timecode.removeline`
- `cmd.timecode.savepreset`
- `cmd.timecode.setdisplayformat.23976p`
- `cmd.timecode.setdisplayformat.24p`
- `cmd.timecode.setdisplayformat.25p`
- `cmd.timecode.setdisplayformat.30drop`
- `cmd.timecode.setdisplayformat.30nondrop`
- `cmd.timecode.setdisplayformat.30p`
- `cmd.timecode.setdisplayformat.50p`
- `cmd.timecode.setdisplayformat.60drop`
- `cmd.timecode.setdisplayformat.60nondrop`
- `cmd.timecode.setdisplayformat.60p`
- `cmd.timecode.setdisplayformat.clipname`
- `cmd.timecode.setdisplayformat.feetframes16mm`
- `cmd.timecode.setdisplayformat.feetframes35mm`
- `cmd.timecode.setdisplayformat.frames`
- `cmd.timecode.setdisplayformat.source`
- `cmd.timecode.settype.absolute`
- `cmd.timecode.settype.duration`
- `cmd.timecode.settype.inout`
- `cmd.timecode.settype.master`
- `cmd.timecode.settype.remaining`
- `cmd.timecode.settype.topclipname`
- `cmd.timecode.toggle.overrideprojectproperties`

## timeline (118)

- `cmd.timeline.activate.next.caption.track` [timeline]
- `cmd.timeline.activate.prev.caption.track` [timeline]
- `cmd.timeline.audio.clip.keyframes.show` [timeline]
- `cmd.timeline.audio.show.audioheaderonsmalltracks` [timeline]
- `cmd.timeline.audio.show.esp.badges` [timeline]
- `cmd.timeline.audio.show.keyframes` [timeline]
- `cmd.timeline.audio.show.names` [timeline]
- `cmd.timeline.audio.show.waveform` [timeline]
- `cmd.timeline.audio.track.keyframes.show` [timeline]
- `cmd.timeline.caption.viewintextpanel` [timeline]
- `cmd.timeline.composite.preview.during.trim` [timeline]
- `cmd.timeline.customize.audio.header`
- `cmd.timeline.customize.video.header`
- `cmd.timeline.decrease.audio.tracks.height` — Opt+- [timeline]
- `cmd.timeline.decrease.video.tracks.height` — Cmd+- [timeline]
- `cmd.timeline.default.source.assignment`
- `cmd.timeline.editpoint.rippletrimin` [timeline]
- `cmd.timeline.editpoint.rippletrimout` [timeline]
- `cmd.timeline.editpoint.rolledit` [timeline]
- `cmd.timeline.editpoint.trimin` [timeline]
- `cmd.timeline.editpoint.trimout` [timeline]
- `cmd.timeline.expand.all.tracks` — Shift++
- `cmd.timeline.goto.next.caption.trackitem` [timeline]
- `cmd.timeline.goto.prev.caption.trackitem` [timeline]
- `cmd.timeline.hide.all.caption.tracks` [timeline]
- `cmd.timeline.increase.audio.tracks.height` — Opt++ [timeline]
- `cmd.timeline.increase.video.tracks.height` — Cmd++ [timeline]
- `cmd.timeline.interpolation.bezier` [timeline]
- `cmd.timeline.interpolation.bezier.auto` [timeline]
- `cmd.timeline.interpolation.bezier.continuous` [timeline]
- `cmd.timeline.interpolation.delete` [timeline]
- `cmd.timeline.interpolation.easein` [timeline]
- `cmd.timeline.interpolation.easeout` [timeline]
- `cmd.timeline.interpolation.hold` [timeline]
- `cmd.timeline.interpolation.linear` [timeline]
- `cmd.timeline.manage.source.assignment.presets`
- `cmd.timeline.manage.track.height.presets`
- `cmd.timeline.minimize.all.tracks` — Shift+-
- `cmd.timeline.move.cti.to.cursor` [timeline]
- `cmd.timeline.nudge.down` — Opt+Down [timeline]
- `cmd.timeline.nudge.left.one` — Cmd+Left [timeline]
- `cmd.timeline.nudge.left.several` — Shift+Cmd+Left [timeline]
- `cmd.timeline.nudge.right.one` — Cmd+Right [timeline]
- `cmd.timeline.nudge.right.several` — Shift+Cmd+Right [timeline]
- `cmd.timeline.nudge.up` — Opt+Up [timeline]
- `cmd.timeline.paste.to.same.track` — Cmd+V [timeline]
- `cmd.timeline.pasteinsert.to.same.track` — Shift+Cmd+V [timeline]
- `cmd.timeline.ripple.delete` — Opt+Delete [timeline]
- `cmd.timeline.save.source.assignment.preset`
- `cmd.timeline.save.track.height.preset`
- `cmd.timeline.sequence.audiounits` [timeline]
- `cmd.timeline.sequence.createpreset` [timeline]
- `cmd.timeline.sequence.labelcolor` [timeline]
- `cmd.timeline.sequence.logwaveformscaling` [timeline]
- `cmd.timeline.sequence.rectifiedwaveforms` [timeline]
- `cmd.timeline.sequence.revealinproject` [timeline]
- `cmd.timeline.sequence.showworkarea` [timeline]
- `cmd.timeline.sequence.waveformsuselabel` [timeline]
- `cmd.timeline.sequence.zeropoint` [timeline]
- `cmd.timeline.setttransitionduration` [timeline]
- `cmd.timeline.show.active.caption.track.only` [timeline]
- `cmd.timeline.show.all.caption.tracks` [timeline]
- `cmd.timeline.show.direct.clip.manipulation`
- `cmd.timeline.show.duplicate.frames` [timeline]
- `cmd.timeline.show.next.screen` — PageDown [timeline]
- `cmd.timeline.show.previous.screen` — PageUp [timeline]
- `cmd.timeline.show.proxy.badges` [timeline]
- `cmd.timeline.show.sourceclip.name.label` [timeline]
- `cmd.timeline.slide.left.one` — Opt+, [timeline]
- `cmd.timeline.slide.left.several` — Opt+Shift+, [timeline]
- `cmd.timeline.slide.right.one` — Opt+. [timeline]
- `cmd.timeline.slide.right.several` — Opt+Shift+. [timeline]
- `cmd.timeline.slip.left.one` — Opt+Cmd+Left [timeline]
- `cmd.timeline.slip.left.several` — Opt+Shift+Cmd+Left [timeline]
- `cmd.timeline.slip.right.one` — Opt+Cmd+Right [timeline]
- `cmd.timeline.slip.right.several` — Opt+Shift+Cmd+Right [timeline]
- `cmd.timeline.source.assignment.preset.0`
- `cmd.timeline.source.assignment.preset.1`
- `cmd.timeline.source.assignment.preset.2`
- `cmd.timeline.source.assignment.preset.3`
- `cmd.timeline.source.assignment.preset.4`
- `cmd.timeline.source.assignment.preset.5`
- `cmd.timeline.source.assignment.preset.6`
- `cmd.timeline.source.assignment.preset.7`
- `cmd.timeline.source.assignment.preset.8`
- `cmd.timeline.source.assignment.preset.9`
- `cmd.timeline.togglelockaudiotracks` [timeline]
- `cmd.timeline.togglelockvideotracks` [timeline]
- `cmd.timeline.track.height.preset.0`
- `cmd.timeline.track.height.preset.1`
- `cmd.timeline.track.height.preset.2`
- `cmd.timeline.track.height.preset.3`
- `cmd.timeline.track.height.preset.4`
- `cmd.timeline.track.height.preset.5`
- `cmd.timeline.track.height.preset.6`
- `cmd.timeline.track.height.preset.7`
- `cmd.timeline.track.height.preset.8`
- `cmd.timeline.track.height.preset.9`
- `cmd.timeline.trackitem.linkmedia` [timeline]
- `cmd.timeline.trackitem.unlinkmedia` [timeline]
- `cmd.timeline.transition.apply.audio.crossfade` [timeline]
- `cmd.timeline.transition.apply.default.audio.from.playhead` [timeline]
- `cmd.timeline.transition.apply.default.audio.to.playhead` [timeline]
- `cmd.timeline.transition.apply.default.video.from.playhead` [timeline]
- `cmd.timeline.transition.apply.default.video.to.playhead` [timeline]
- `cmd.timeline.transition.apply.video.crossfade` [timeline]
- `cmd.timeline.transition.apply.video.diptowhite` [timeline]
- `cmd.timeline.transition.apply.video.wipe` [timeline]
- `cmd.timeline.video.show.keyframes` [timeline]
- `cmd.timeline.video.show.names` [timeline]
- `cmd.timeline.video.show.thumbnails` [timeline]
- `cmd.timeline.video.style.frames` [timeline]
- `cmd.timeline.video.style.head` [timeline]
- `cmd.timeline.video.style.headandtail` [timeline]
- `cmd.timeline.video.style.showmarkers` [timeline]
- `cmd.timeline.voiceover.track.record` [timeline]
- `cmd.timeline.workbar.set.in` — Opt+key210 [timeline]
- `cmd.timeline.workbar.set.out` — Opt+; [timeline]

## titler (15)

- `cmd.titler.misc.kern.50.dec`
- `cmd.titler.misc.kern.50.inc`
- `cmd.titler.misc.kern.five.dec`
- `cmd.titler.misc.kern.five.inc`
- `cmd.titler.misc.kern.one.dec`
- `cmd.titler.misc.kern.one.inc`
- `cmd.titler.misc.lead.five.dec`
- `cmd.titler.misc.lead.five.inc`
- `cmd.titler.misc.lead.one.dec`
- `cmd.titler.misc.lead.one.inc`
- `cmd.titler.misc.size.five.dec`
- `cmd.titler.misc.size.five.inc`
- `cmd.titler.misc.size.one.dec`
- `cmd.titler.misc.size.one.inc`
- `cmd.titler.typekit`

## tlnav (56)

- `cmd.tlnav.add.tracks.to.match.source`
- `cmd.tlnav.assign.black`
- `cmd.tlnav.go.to.next.selected.edit`
- `cmd.tlnav.go.to.prev.selected.edit`
- `cmd.tlnav.move.all.source.audio.down`
- `cmd.tlnav.move.all.source.audio.up`
- `cmd.tlnav.move.all.source.video.down`
- `cmd.tlnav.move.all.source.video.up`
- `cmd.tlnav.move.all.target.audio.down`
- `cmd.tlnav.move.all.target.audio.up`
- `cmd.tlnav.move.all.target.video.down`
- `cmd.tlnav.move.all.target.video.up`
- `cmd.tlnav.next.edit` — Down
- `cmd.tlnav.next.edit.any.track` — Shift+Down
- `cmd.tlnav.prev.edit` — Up
- `cmd.tlnav.prev.edit.any.track` — Shift+Up
- `cmd.tlnav.reveal.nested.sequence` — Shift+Cmd+T
- `cmd.tlnav.select.clip.at.playhead` — D
- `cmd.tlnav.select.in.to.out`
- `cmd.tlnav.select.nearest.edit.as.ripple.in`
- `cmd.tlnav.select.nearest.edit.as.ripple.out`
- `cmd.tlnav.select.nearest.edit.as.roll`
- `cmd.tlnav.select.nearest.edit.as.trim.in`
- `cmd.tlnav.select.nearest.edit.as.trim.out`
- `cmd.tlnav.select.next.clip` — Cmd+Down
- `cmd.tlnav.select.previous.clip` — Cmd+Up
- `cmd.tlnav.targets.snap.to.edits`
- `cmd.tlnav.toggle.all.source.audio` — Opt+Cmd+9
- `cmd.tlnav.toggle.all.source.audio.silent`
- `cmd.tlnav.toggle.all.source.caption`
- `cmd.tlnav.toggle.all.source.caption.black`
- `cmd.tlnav.toggle.all.source.video` — Opt+Cmd+0
- `cmd.tlnav.toggle.all.source.video.black`
- `cmd.tlnav.toggle.all.target.audio` — Cmd+9
- `cmd.tlnav.toggle.all.target.video` — Cmd+0
- `cmd.tlnav.toggle.target.audio.1`
- `cmd.tlnav.toggle.target.audio.2`
- `cmd.tlnav.toggle.target.audio.3`
- `cmd.tlnav.toggle.target.audio.4`
- `cmd.tlnav.toggle.target.audio.5`
- `cmd.tlnav.toggle.target.audio.6`
- `cmd.tlnav.toggle.target.audio.7`
- `cmd.tlnav.toggle.target.audio.8`
- `cmd.tlnav.toggle.target.video.1`
- `cmd.tlnav.toggle.target.video.2`
- `cmd.tlnav.toggle.target.video.3`
- `cmd.tlnav.toggle.target.video.4`
- `cmd.tlnav.toggle.target.video.5`
- `cmd.tlnav.toggle.target.video.6`
- `cmd.tlnav.toggle.target.video.7`
- `cmd.tlnav.toggle.target.video.8`
- `cmd.tlnav.toggle.timeerulernumbers` [timeline]
- `cmd.tlnav.trim.in.to.cti` — Opt+Q
- `cmd.tlnav.trim.out.to.cti` — Opt+W
- `cmd.tlnav.zoomto.frame`
- `cmd.tlnav.zoomto.sequence` — Cmd+\

## toggle (6)

- `cmd.toggle.audio.scrubbing` — Shift+S
- `cmd.toggle.audio.shuttling.maintainpitch`
- `cmd.toggle.fullscreen.monitor` — Ctrl+'
- `cmd.toggle.maximize.focused.frame` — Shift+,
- `cmd.toggle.maximize.frame`
- `cmd.toggle.maximize.monitor`

## toggletransmit (1)

- `cmd.toggletransmit`

## tools (23)

- `cmd.tools.01pointer` — V
- `cmd.tools.02_5trackselectbackward` — Shift+A
- `cmd.tools.02trackselectforward` — A
- `cmd.tools.03ripple` — B
- `cmd.tools.04roll` — Opt+Shift+C
- `cmd.tools.05ratestretch` — R
- `cmd.tools.06razor` — C
- `cmd.tools.07slip` — Y
- `cmd.tools.08slide` — U
- `cmd.tools.09pen` — P
- `cmd.tools.10hand` — H
- `cmd.tools.11zoom` — Z
- `cmd.tools.12text` — T
- `cmd.tools.13rectshape`
- `cmd.tools.14verticaltype`
- `cmd.tools.15ellipseshape`
- `cmd.tools.16Remix`
- `cmd.tools.17polygonshape`
- `cmd.tools.18smartselection`
- `cmd.tools.19ellipseselection`
- `cmd.tools.20rectselection`
- `cmd.tools.21bezierselection`
- `cmd.tools.22genextend`

## transcript (1)

- `cmd.transcript.generaterandom` [project]

## transport (26)

- `cmd.transport.fastforward`
- `cmd.transport.play.ctitoaudioout`
- `cmd.transport.play.ctitoout` — Ctrl+Space
- `cmd.transport.play.ctitovideoout`
- `cmd.transport.play.fat` — Shift+Space
- `cmd.transport.playaudiointoout`
- `cmd.transport.playedit` — Shift+K
- `cmd.transport.playintoout` — Opt+K
- `cmd.transport.playvideointoout`
- `cmd.transport.record`
- `cmd.transport.rewind`
- `cmd.transport.selectedclip.end` — Shift+End
- `cmd.transport.selectedclip.start` — Shift+Home
- `cmd.transport.sequence.end` — End
- `cmd.transport.sequence.start` — Home
- `cmd.transport.shuttle.left` — J
- `cmd.transport.shuttle.right` — L
- `cmd.transport.shuttle.slow.left` — Shift+J
- `cmd.transport.shuttle.slow.right` — Shift+L
- `cmd.transport.shuttle.stop` — K
- `cmd.transport.step.back` — Left
- `cmd.transport.step.back.five` — Shift+Left
- `cmd.transport.step.forward` — Right
- `cmd.transport.step.forward.five` — Shift+Right
- `cmd.transport.stop`
- `cmd.transport.toggleplay` — Space

## uif (56)

- `uif.export.as.AAF`
- `uif.export.as.Avid Log Exchange`
- `uif.export.as.Final Cut Pro XML`
- `uif.window.Audio Clip Mixer`
- `uif.window.Audio Clip Mixer.0.0`
- `uif.window.Audio Meter`
- `uif.window.Audio Meter.0.0`
- `uif.window.Audio Mixers`
- `uif.window.Audio Mixers.0.0`
- `uif.window.Color`
- `uif.window.Color.0.0`
- `uif.window.Effect Controls`
- `uif.window.Effect Controls.0.0`
- `uif.window.Effects`
- `uif.window.Effects.0.0`
- `uif.window.EssentialSound`
- `uif.window.EssentialSound.0.0`
- `uif.window.Events`
- `uif.window.Events.0.0`
- `uif.window.Frame.io`
- `uif.window.Frame.io.0.0`
- `uif.window.Graphics`
- `uif.window.Graphics.0.0`
- `uif.window.History`
- `uif.window.History.0.0`
- `uif.window.Info`
- `uif.window.Info.0.0`
- `uif.window.Learning`
- `uif.window.Learning.0.0`
- `uif.window.MarkerList`
- `uif.window.MarkerList.0.0`
- `uif.window.Media Browser`
- `uif.window.Media Browser.0.0`
- `uif.window.Metadata Editor`
- `uif.window.Metadata Editor.0.0`
- `uif.window.PrProductionFolder`
- `uif.window.PrProductionFolder.0.0`
- `uif.window.Program Monitors`
- `uif.window.Projects`
- `uif.window.Properties2`
- `uif.window.Properties2.0.0`
- `uif.window.Scopes`
- `uif.window.Scopes.0.0`
- `uif.window.Services`
- `uif.window.Services.0.0`
- `uif.window.Source Monitors`
- `uif.window.Source Monitors.0.0`
- `uif.window.Timecode`
- `uif.window.Timecode.0.0`
- `uif.window.Timelines`
- `uif.window.Tools`
- `uif.window.Tools.0.0`
- `uif.window.com.adobe.dva.progress`
- `uif.window.com.adobe.dva.progress.0.0`
- `uif.window.com.adobe.dva.text`
- `uif.window.com.adobe.dva.text.0.0`

## window (22)

- `cmd.window.discoverpanel`
- `cmd.window.pluginmanager`
- `cmd.window.plugins.apidocumentation`
- `cmd.window.plugins.browseplugins`
- `cmd.window.plugins.manageplugins`
- `cmd.window.plugins.pluginpanel`
- `cmd.window.togglesourceprogram`
- `cmd.window.user.workspace.0` — Opt+Shift+1
- `cmd.window.user.workspace.1` — Opt+Shift+2
- `cmd.window.user.workspace.2` — Opt+Shift+3
- `cmd.window.user.workspace.3` — Opt+Shift+4
- `cmd.window.user.workspace.4` — Opt+Shift+5
- `cmd.window.user.workspace.5` — Opt+Shift+6
- `cmd.window.user.workspace.6` — Opt+Shift+7
- `cmd.window.user.workspace.7` — Opt+Shift+8
- `cmd.window.user.workspace.8` — Opt+Shift+9
- `cmd.window.workspace.delete`
- `cmd.window.workspace.edit`
- `cmd.window.workspace.import`
- `cmd.window.workspace.new`
- `cmd.window.workspace.revert` — Opt+Shift+0
- `cmd.window.workspace.save`

## zoom (4)

- `cmd.zoom.in` — +
- `cmd.zoom.out` — -
- `cmd.zoom.player.in` [program.monitor, source.monitor]
- `cmd.zoom.player.out` [program.monitor, source.monitor]

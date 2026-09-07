# Effect and transition match names (Premiere 26.0.1, mined from the binaries 2026-05-02)

QE's getVideoEffectByName / getVideoTransitionByName take the DISPLAY name; the two-argument form (name, true) takes the MATCH name below and returns a nameless object when it misses. Match names are stable across languages; display names are not. Source: premiere-map reports/effect_matchnames_2026-05-02.md.

| MatchName | matched lockey | en_US value | heuristic |
| `AE.ADBE AECrop` | `MediaCore/AEFilters/AECrop/Name` | Crop | `key_segment_match` |
| `AE.ADBE AEMask` | `MediaCore/AEFilters/AEMask/Name` | Mask | `key_segment_match` |
| `AE.ADBE AEMask2` | `MediaCore/AEFilters/AEMask2/Name` | Mask2 | `key_segment_match` |
| `AE.ADBE Alpha Adjust` | `MediaCore/AEFilters/AlphaAdjust/Name` | Alpha Adjust | `value==unprefixed` |
| `AE.ADBE Alpha Glow` | `MediaCore/AEFilters/AEFilterAlphaGlow/Name` | Alpha Glow | `value==unprefixed` |
| `AE.ADBE Barn Doors` | `MediaCore/AEFilters/AEFilterBarnDoors/Name` | Barn Doors | `value==unprefixed` |
| `AE.ADBE Black & White` | `MediaCore/PremiereFilters/BlackAndWhite/Name` | Black & White | `value==unprefixed` |
| `AE.ADBE Camera Blur` | `MediaCore/AEFilters/AEFilterCameraBlur/Name` | Camera Blur | `value==unprefixed` |
| `AE.ADBE Center Split` | `MediaCore/AEFilters/AEFilterCenterSplit/Name` | Center Split | `value==unprefixed` |
| `AE.ADBE Color And Contrast` | `MediaCore/AEFilters/AEFilterColorAndContrast/Name` | Color And Contrast | `value==unprefixed` |
| `AE.ADBE Color Film` | `MediaCore/AEFilters/AEFilterColorFilm/Name` | Color Film | `value==unprefixed` |
| `AE.ADBE Color Shift` | `MediaCore/AEFilters/AEFilterColorShift/Name` | Color Shift | `value==unprefixed` |
| `AE.ADBE Color Texture` | `MediaCore/AEFilters/AEColorTexture/Name` | Texture | `key_segment_match` |
| `AE.ADBE Contrast` | `MediaCore/AEFilters/AEFilterContrast/Name` | Contrast | `value==unprefixed` |
| `AE.ADBE Echo` | `MediaCore/AEFilters/AEFilterEcho/BetaFeature/Echo/Name` | Echo Effect GPU acceleration | `key_segment_match` |
| `AE.ADBE Edge Feather` | `MediaCore/PremiereFilters/EdgeFeather/Name` | Edge Feather | `value==unprefixed` |
| `AE.ADBE Fast Color Corrector` | `MediaCore/AEFilters/ColorFast/Name` | Fast Color Corrector | `value==unprefixed` |
| `AE.ADBE Flare` | `MediaCore/AEFilters/AEFilterFlare/Name` | Flare | `value==unprefixed` |
| `AE.ADBE Fractal Noise` | `MediaCore/AEFilters/AEFilterVRFractalNoise/Name` | VR Fractal Noise | `value_contains_unprefixed` |
| `AE.ADBE Garbage Matte` | `MediaCore/AEFilters/AEGarbageMatte/Name` | Four-Point Garbage Matte | `key_segment_match` |
| `AE.ADBE Garbage Matte 16` | `MediaCore/AEFilters/AEGarbageMatte16/Name` | Sixteen-Point Garbage Matte | `key_segment_match` |
| `AE.ADBE Garbage Matte 8` | `MediaCore/AEFilters/AEGarbageMatte8/Name` | Eight-Point Garbage Matte | `key_segment_match` |
| `AE.ADBE Gaussian Blur` | `MediaCore/AEFilters/AEGaussianBlur/Name` | Gaussian Blur | `value==unprefixed` |
| `AE.ADBE Horizontal Flip` | `MediaCore/AEFilters/AEFilterHorizontalFlip/Name` | Horizontal Flip | `value==unprefixed` |
| `AE.ADBE Inset` | `MediaCore/AEFilters/AEFilterInset/Name` | Inset | `value==unprefixed` |
| `AE.ADBE LightingEffect` | `MediaCore/AEFilters/LightingEffect/Name` | Lighting Effects | `key_segment_match` |
| `AE.ADBE Lightning` | `MediaCore/AEFilters/AEFilterLightning2/BetaFeature/AdvancedLightning/Name` | AdvancedLightning Effect GPU acceleration | `value_contains_unprefixed` |
| `AE.ADBE Luma Corrector` | `MediaCore/AEFilters/LumaCorrector/Name` | Luma Corrector | `value==unprefixed` |
| `AE.ADBE Luma Curve` | `MediaCore/AEFilters/LumaCurve/Name` | Luma Curve | `value==unprefixed` |
| `AE.ADBE Lumetri` | `MediaCore/AEFilters/AELumetri/Name` | Lumetri Color | `key_segment_match` |
| `AE.ADBE Midtones` | `MediaCore/AEFilters/AEFilterMidtones/Name` | Midtones | `value==unprefixed` |
| `AE.ADBE Motion` | `MediaCore/AEFilters/Motion/Name` | Motion | `value==unprefixed` |
| `AE.ADBE Noise` | `MediaCore/AEFilters/AEFilterVRDenoise/Name` | VR De-Noise | `value_contains_unprefixed` |
| `AE.ADBE Non-Additive Dissolve` | `MediaCore/AEFilters/AEFilterNonAdditiveDissolve/Name` | Non-Additive Dissolve | `value==unprefixed` |
| `AE.ADBE Opacity` | `MediaCore/AEFilters/Opacity/Name` | Opacity | `value==unprefixed` |
| `AE.ADBE Page Peel` | `MediaCore/AEFilters/AEFilterPagePeel/BetaFeature/PagePeel/Name` | Page Peel Transition Effect GPU acceleration | `key_segment_match` |
| `AE.ADBE Posterize` | `MediaCore/AEFilters/AEFilterPosterize_Time/BetaFeature/PosterizeTime/Name` | Posterize Time Effect GPU acceleration | `value_contains_unprefixed` |
| `AE.ADBE Posterize Time` | `MediaCore/AEFilters/AEFilterPosterize_Time/BetaFeature/PosterizeTime/Name` | Posterize Time Effect GPU acceleration | `key_segment_match` |
| `AE.ADBE ProcAmp` | `MediaCore/AEFilters/ProcAmp/Name` | ProcAmp | `value==unprefixed` |
| `AE.ADBE RGB Color Corrector` | `MediaCore/AEFilters/RGBCorrector/Name` | RGB Color Corrector | `value==unprefixed` |
| `AE.ADBE RGB Curves` | `MediaCore/AEFilters/RGBCurves/Name` | RGB Curves | `value==unprefixed` |
| `AE.ADBE Replicate` | `MediaCore/AEFilters/AEFilterReplicate/Name` | Replicate | `value==unprefixed` |
| `AE.ADBE Shape` | `MediaCore/AEFilters/Graphics/AEShape/Name` | Shape | `value==unprefixed` |
| `AE.ADBE Sharpen` | `MediaCore/AEFilters/AEFilterVRSharpen/Name` | VR Sharpen | `value_contains_unprefixed` |
| `AE.ADBE Split` | `MediaCore/AEFilters/AEFilterCenterSplit/Name` | Center Split | `value_contains_unprefixed` |
| `AE.ADBE Text` | `MediaCore/AEFilters/Graphics/AEText/Name` | Text | `value==unprefixed` |
| `AE.ADBE Three-Way Color Corrector` | `MediaCore/AEFilters/ColorThreeWay/Name` | Three-Way Color Corrector | `value==unprefixed` |
| `AE.ADBE Ultra Key` | `MediaCore/AEFilters/AEUltraKey/Name` | Ultra Key | `value==unprefixed` |
| `AE.ADBE VR Projection` | `MediaCore/AEFilters/AEVRProjection/Name` | VR Projection | `value==unprefixed` |
| `AE.ADBE Vertical Flip` | `MediaCore/AEFilters/AEFilterVerticalFlip/Name` | Vertical Flip | `value==unprefixed` |
| `AE.ADBE Video Limiter` | `MediaCore/AEFilters/LegacyVideoLimiter/Name` | Video Limiter (legacy) | `value_contains_unprefixed` |
| `AE.ADBE Wipe` | `MediaCore/AEFilters/AEVRGradientWipe/Name` | VR Gradient Wipe | `value_contains_unprefixed` |
- `AE.ADBE 4ColorGradient`
- `AE.ADBE AEASCCDL`
- `AE.ADBE AEFilterAutoFramer`
- `AE.ADBE AEGPUPageCurl`
- `AE.ADBE AEGPURefract`
- `AE.ADBE AEGPURipple`
- `AE.ADBE AESDRConform`
- `AE.ADBE ARRIRAW MXF.SourceSettings`
- `AE.ADBE ARRIRAW.SourceSettings`
- `AE.ADBE Basic 3D`
- `AE.ADBE Block Dissolve`
- `AE.ADBE Brightness & Contrast 2`
- `AE.ADBE Brightness & Contrast 2 With Legacy Checkbox`
- `AE.ADBE Broadcast Colors`
- `AE.ADBE Brush Strokes`
- `AE.ADBE CanonRaw.SourceSettings`
- `AE.ADBE Capsule`
- `AE.ADBE Change To Color`
- `AE.ADBE CinemaDNG.SourceSettings`
- `AE.ADBE Cineon Converter`
- `AE.ADBE Clock Wipe`
- `AE.ADBE Color Emboss`
- `AE.ADBE Color Key`
- `AE.ADBE CompoundComponent`
- `AE.ADBE Corner Pin`
- `AE.ADBE Cross Dissolve New`
- `AE.ADBE DPX.SourceSettings`
- `AE.ADBE DigitalVideoLimiter`
- `AE.ADBE Dip To Black`
- `AE.ADBE Dip To White`
- `AE.ADBE Directional Motion Blur`
- `AE.ADBE Drop Shadow`
- `AE.ADBE Easy Levels2`
- `AE.ADBE EffectMaskNode`
- `AE.ADBE Emboss`
- `AE.ADBE Fast Blur`
- `AE.ADBE Find Edges`
- `AE.ADBE Find Edges Premul`
- `AE.ADBE GOP.SourceSettings`
- `AE.ADBE Gaussian Blur 2`
- `AE.ADBE Geometry`
- `AE.ADBE Geometry2`
- `AE.ADBE Glo2`
- `AE.ADBE Graphic Group`
- `AE.ADBE Graphic SubGroup`
- `AE.ADBE HUE SATURATION`
- `AE.ADBE ImporterMXF.SourceSettings`
- `AE.ADBE Invert`
- `AE.ADBE Legacy Key BlueScreen`
- `AE.ADBE Legacy Key Chroma`
- `AE.ADBE Legacy Key Difference Matte`
- `AE.ADBE Legacy Key GreenScreen`
- `AE.ADBE Legacy Key Image Matte`
- `AE.ADBE Legacy Key Luma`
- `AE.ADBE Legacy Key Multiply`
- `AE.ADBE Legacy Key NonRed`
- `AE.ADBE Legacy Key RGBDifference`
- `AE.ADBE Legacy Key Remove Matte`
- `AE.ADBE Legacy Key Screen`
- `AE.ADBE Legacy Key Track Matte`
- `AE.ADBE Lens Flare`
- `AE.ADBE Lightning 2`
- `AE.ADBE Lightning2`
- `AE.ADBE Linear Wipe`
- `AE.ADBE MPEG.SourceSettings`
- `AE.ADBE Magnify`
- `AE.ADBE Mirror`
- `AE.ADBE MorphCut`
- `AE.ADBE Mosaic`
- `AE.ADBE Motion Blur`
- `AE.ADBE Multicam Hilite`
- `AE.ADBE OFMotionBlur`
- `AE.ADBE Offset`
- `AE.ADBE OpacityMaskNode`
- `AE.ADBE PPro ClipName`
- `AE.ADBE PPro Metadata`
- `AE.ADBE PPro SimpleText`
- `AE.ADBE PPro Timecode`
- `AE.ADBE Pro Levels`
- `AE.ADBE Pro Levels2`
- `AE.ADBE ProResRaw.SourceSettings`
- `AE.ADBE Push`
- `AE.ADBE RED.SourceSettings`
- `AE.ADBE Radial Wipe`
- `AE.ADBE Ramp`
- `AE.ADBE Rolling Shutter`
- `AE.ADBE Roughen Edges`
- `AE.ADBE Sharpen Black Border`
- `AE.ADBE Slide`
- `AE.ADBE SonyRawF65.SourceSettings`
- `AE.ADBE Spherize`
- `AE.ADBE Strobe`
- `AE.ADBE SubspaceStabilizer`
- `AE.ADBE Timewarp`
- `AE.ADBE Tint`
- `AE.ADBE Tone Map`
- `AE.ADBE Turbulent Displace`
- `AE.ADBE Twirl`
- `AE.ADBE Unsharp Mask`
- `AE.ADBE Wave Warp`
- `AE.ADBE Whip`
- `AE.ADBE Write-on`
| MatchName | de_DE | en_US | fr_FR | it_IT | ja_JP | zh_CN |
| `AE.ADBE AECrop` | Zuschneiden | Crop | Recadrage | Ritaglia | クロップ | 裁剪 |
| `AE.ADBE AEMask` | Maske | Mask | Masque | Maschera | マスク | 蒙版 |
| `AE.ADBE AEMask2` | Maske2 | Mask2 | Mask2 | Maschera2 | Mask2 | Mask2 |
| `AE.ADBE Alpha Adjust` | Alpha-Anpassung | Alpha Adjust | Réglage alpha | Regolazione alfa | アルファチャンネルキー | Alpha 调整 |
| `AE.ADBE Alpha Glow` | Alpha-Glühen | Alpha Glow | Luminescence Alpha | Bagliore alfa | アルファグロー | Alpha 发光 |
| `AE.ADBE Barn Doors` | Schiebetüren | Barn Doors | Portes coulissantes | Doppia porta | ドア (扉) | 双侧平推门 |
| `AE.ADBE Black & White` | Schwarz & Weiß | Black & White | Noir & blanc | Bianco e nero | モノクロ | 黑白 |
| `AE.ADBE Camera Blur` | Kamera weichzeichnen | Camera Blur | Défaut de mise au point | Sfocatura fotocamera | カメラブラー | 摄像机模糊 |
| `AE.ADBE Center Split` | Teilen (Mitte) | Center Split | Eclatement | Divisione centro | センタースプリット | 中心拆分 |
| `AE.ADBE Color And Contrast` | Farbe und Kontrast | Color And Contrast | Couleur et contraste | Colore e contrasto | カラーおよびコントラスト | 颜色和对比度 |

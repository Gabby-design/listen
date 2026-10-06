using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;

namespace ListenAudioControl {
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumeratorComObject { }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice {
        int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
    }

    [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioMeterInformation {
        int GetPeakValue(out float pfPeak);
        int GetMeteringChannelCount(out uint pnChannelCount);
        int GetChannelsPeakValues(uint u32ChannelCount, [Out] float[] afPeakValues);
        int QueryHardwareSupport(out uint pdwHardwareSupportMask);
    }

    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume {
        int RegisterControlChangeNotify(IntPtr pNotify);
        int UnregisterControlChangeNotify(IntPtr pNotify);
        int GetChannelCount(out uint pnChannelCount);
        int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
        int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
        int GetMasterVolumeLevel(out float pfLevelDB);
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
    }

    class Program {
        private static readonly string StateFilePath = Path.Combine(Path.GetTempPath(), "listen_media_state.txt");
        private static MethodInfo asTaskGenericMethod = null;
        private static bool gsmtcInitialized = false;

        static void InitGsmtc() {
            if (gsmtcInitialized) return;
            try {
                Assembly runtimeAssembly = Assembly.Load("System.Runtime.WindowsRuntime, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089");
                Type extType = runtimeAssembly.GetType("System.WindowsRuntimeSystemExtensions");
                foreach (var m in extType.GetMethods(BindingFlags.Public | BindingFlags.Static)) {
                    if (m.Name == "AsTask" && m.IsGenericMethodDefinition && m.GetParameters().Length == 1) {
                        asTaskGenericMethod = m;
                        break;
                    }
                }
                gsmtcInitialized = true;
            } catch {
                gsmtcInitialized = false;
            }
        }

        static object AwaitWinRtOperation(object asyncOp, Type resultType, int timeoutMs = 1500) {
            if (asyncOp == null) return null;
            InitGsmtc();
            if (asTaskGenericMethod == null) return null;

            try {
                MethodInfo specific = asTaskGenericMethod.MakeGenericMethod(resultType);
                object task = specific.Invoke(null, new object[] { asyncOp });
                MethodInfo waitMethod = task.GetType().GetMethod("Wait", new Type[] { typeof(int) });
                bool ok = (bool)waitMethod.Invoke(task, new object[] { timeoutMs });
                if (!ok) return null;
                PropertyInfo resultProp = task.GetType().GetProperty("Result");
                return resultProp != null ? resultProp.GetValue(task, null) : null;
            } catch {
                return null;
            }
        }

        static object GetGsmtcManager() {
            try {
                Type mgrType = Type.GetType("Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime");
                if (mgrType == null) return null;
                MethodInfo reqMethod = mgrType.GetMethod("RequestAsync", BindingFlags.Public | BindingFlags.Static);
                if (reqMethod == null) return null;
                return AwaitWinRtOperation(reqMethod.Invoke(null, null), mgrType, 1500);
            } catch {
                return null;
            }
        }

        static System.Collections.IEnumerable GetGsmtcSessions(object mgr) {
            if (mgr == null) return null;
            try {
                MethodInfo getSessions = mgr.GetType().GetMethod("GetSessions");
                return getSessions.Invoke(mgr, null) as System.Collections.IEnumerable;
            } catch {
                return null;
            }
        }

        static int GetSessionPlaybackStatus(object session) {
            try {
                MethodInfo getPlayback = session.GetType().GetMethod("GetPlaybackInfo");
                object pb = getPlayback.Invoke(session, null);
                if (pb == null) return 0;
                PropertyInfo statusProp = pb.GetType().GetProperty("PlaybackStatus");
                return (int)statusProp.GetValue(pb, null);
            } catch {
                return 0;
            }
        }

        static string GetSessionAppId(object session) {
            try {
                PropertyInfo appProp = session.GetType().GetProperty("SourceAppUserModelId");
                return appProp != null ? (string)appProp.GetValue(session, null) : null;
            } catch {
                return null;
            }
        }

        static bool PauseGsmtcSession(object session) {
            try {
                MethodInfo tryPause = session.GetType().GetMethod("TryPauseAsync");
                if (tryPause == null) return false;
                object op = tryPause.Invoke(session, null);
                object res = AwaitWinRtOperation(op, typeof(bool), 1200);
                return res is bool && (bool)res;
            } catch {
                return false;
            }
        }

        static bool PlayGsmtcSession(object session) {
            try {
                MethodInfo tryPlay = session.GetType().GetMethod("TryPlayAsync");
                if (tryPlay == null) return false;
                object op = tryPlay.Invoke(session, null);
                object res = AwaitWinRtOperation(op, typeof(bool), 1200);
                return res is bool && (bool)res;
            } catch {
                return false;
            }
        }

        static IMMDevice GetDefaultRenderDevice() {
            try {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDevice dev;
                // 0 = eRender, 1 = eMultimedia
                int hr = enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                if (hr == 0 && dev != null) return dev;
            } catch {}
            return null;
        }

        static IAudioMeterInformation GetMeter() {
            var dev = GetDefaultRenderDevice();
            if (dev == null) return null;
            try {
                var iid = typeof(IAudioMeterInformation).GUID;
                object o;
                dev.Activate(ref iid, 23, IntPtr.Zero, out o);
                return (IAudioMeterInformation)o;
            } catch {
                return null;
            }
        }

        static IAudioEndpointVolume GetMasterVolume() {
            var dev = GetDefaultRenderDevice();
            if (dev == null) return null;
            try {
                var iid = typeof(IAudioEndpointVolume).GUID;
                object o;
                dev.Activate(ref iid, 23, IntPtr.Zero, out o);
                return (IAudioEndpointVolume)o;
            } catch {
                return null;
            }
        }

        static float SamplePeak(int samples = 4, int delayMs = 8) {
            var meter = GetMeter();
            if (meter == null) return 0f;
            float maxPeak = 0f;
            for (int i = 0; i < samples; i++) {
                float val = 0f;
                meter.GetPeakValue(out val);
                if (val > maxPeak) maxPeak = val;
                if (i < samples - 1 && delayMs > 0) {
                    Thread.Sleep(delayMs);
                }
            }
            return maxPeak;
        }

        static bool PauseIfPlaying() {
            // 1. Check Windows GSMTC for any actively playing media session (status == 4 / Playing)
            object mgr = GetGsmtcManager();
            var sessions = GetGsmtcSessions(mgr);
            List<string> pausedApps = new List<string>();

            if (sessions != null) {
                foreach (var s in sessions) {
                    int status = GetSessionPlaybackStatus(s);
                    // 4 = Playing
                    if (status == 4) {
                        string appId = GetSessionAppId(s);
                        bool ok = PauseGsmtcSession(s);
                        if (ok && !string.IsNullOrEmpty(appId)) {
                            pausedApps.Add(appId);
                        }
                    }
                }
            }

            if (pausedApps.Count > 0) {
                // Record paused sessions to state file for reliable resume
                try {
                    List<string> lines = new List<string>();
                    foreach (var a in pausedApps) {
                        lines.Add("GSMTC:" + a);
                    }
                    File.WriteAllLines(StateFilePath, lines.ToArray());
                } catch {}
                Console.WriteLine("PAUSED");
                return true;
            }

            // 2. If no GSMTC media session is playing, check if non-GSMTC audio is actively outputting sound
            float peak = SamplePeak(4, 8);
            if (peak > 0.02f) {
                // Background sound is actively blasting from an application without GSMTC
                // Duck master volume so voice is not contaminated; NEVER send blind media key!
                var vol = GetMasterVolume();
                if (vol != null) {
                    float currentLevel = 1.0f;
                    vol.GetMasterVolumeLevelScalar(out currentLevel);
                    Guid g = Guid.Empty;
                    vol.SetMasterVolumeLevelScalar(0.05f, ref g);
                    try {
                        File.WriteAllText(StateFilePath, "DUCK:" + currentLevel.ToString("R"));
                    } catch {}
                    Console.WriteLine("PAUSED");
                    return true;
                }
            }

            // 3. Nothing is playing. NEVER touch playback or send media keys!
            try {
                if (File.Exists(StateFilePath)) File.Delete(StateFilePath);
            } catch {}
            Console.WriteLine("NOT_PLAYING");
            return false;
        }

        static bool ResumeMedia() {
            if (!File.Exists(StateFilePath)) {
                Console.WriteLine("NO_ACTION");
                return false;
            }

            string[] lines;
            try {
                lines = File.ReadAllLines(StateFilePath);
                File.Delete(StateFilePath);
            } catch {
                Console.WriteLine("NO_ACTION");
                return false;
            }

            if (lines.Length == 0) {
                Console.WriteLine("NO_ACTION");
                return false;
            }

            bool didResume = false;
            List<string> gsmtcAppsToResume = new List<string>();

            foreach (var line in lines) {
                if (line.StartsWith("GSMTC:")) {
                    string appId = line.Substring(6).Trim();
                    if (!string.IsNullOrEmpty(appId)) {
                        gsmtcAppsToResume.Add(appId);
                    }
                } else if (line.StartsWith("DUCK:")) {
                    string valStr = line.Substring(5).Trim();
                    float targetVol;
                    if (float.TryParse(valStr, out targetVol)) {
                        var vol = GetMasterVolume();
                        if (vol != null) {
                            Guid g = Guid.Empty;
                            vol.SetMasterVolumeLevelScalar(targetVol, ref g);
                            didResume = true;
                        }
                    }
                }
            }

            if (gsmtcAppsToResume.Count > 0) {
                object mgr = GetGsmtcManager();
                var sessions = GetGsmtcSessions(mgr);
                if (sessions != null) {
                    foreach (var s in sessions) {
                        string appId = GetSessionAppId(s);
                        if (!string.IsNullOrEmpty(appId) && gsmtcAppsToResume.Contains(appId)) {
                            int status = GetSessionPlaybackStatus(s);
                            // 5 = Paused
                            if (status == 5) {
                                bool ok = PlayGsmtcSession(s);
                                if (ok) didResume = true;
                            }
                        }
                    }
                }
            }

            if (didResume) {
                Console.WriteLine("RESUMED");
                return true;
            } else {
                Console.WriteLine("NO_ACTION");
                return false;
            }
        }

        static bool IsAudioPlaying() {
            // Check GSMTC first
            object mgr = GetGsmtcManager();
            var sessions = GetGsmtcSessions(mgr);
            if (sessions != null) {
                foreach (var s in sessions) {
                    if (GetSessionPlaybackStatus(s) == 4) return true;
                }
            }
            // Check audio meter
            float peak = SamplePeak(4, 8);
            return peak > 0.02f;
        }

        static int Main(string[] args) {
            if (args.Length == 0) {
                Console.WriteLine("Usage: audiocontrol.exe [is-playing | get-peak | pause-if-playing | resume-media | start-listening | stop-listening | is-muted | mute | unmute]");
                return 1;
            }

            string cmd = args[0].ToLower();

            try {
                if (cmd == "is-playing") {
                    bool playing = IsAudioPlaying();
                    Console.WriteLine(playing ? "TRUE" : "FALSE");
                    return 0;
                } else if (cmd == "get-peak") {
                    float peak = SamplePeak(4, 8);
                    Console.WriteLine(peak.ToString("F6"));
                    return 0;
                } else if (cmd == "pause-if-playing" || cmd == "start-listening") {
                    PauseIfPlaying();
                    return 0;
                } else if (cmd == "resume-media") {
                    ResumeMedia();
                    return 0;
                } else if (cmd == "stop-listening") {
                    bool shouldResume = args.Length > 1 && (args[1].ToLower() == "resume" || args[1].ToLower() == "true");
                    if (shouldResume) {
                        ResumeMedia();
                    } else {
                        try {
                            if (File.Exists(StateFilePath)) File.Delete(StateFilePath);
                        } catch {}
                        Console.WriteLine("NO_ACTION");
                    }
                    return 0;
                } else if (cmd == "is-muted") {
                    var vol = GetMasterVolume();
                    if (vol != null) {
                        bool m;
                        vol.GetMute(out m);
                        Console.WriteLine(m ? "TRUE" : "FALSE");
                        return 0;
                    }
                    Console.WriteLine("FALSE");
                    return 0;
                } else if (cmd == "mute") {
                    var vol = GetMasterVolume();
                    if (vol != null) {
                        Guid g = Guid.Empty;
                        vol.SetMute(true, ref g);
                        Console.WriteLine("MUTED");
                        return 0;
                    }
                } else if (cmd == "unmute") {
                    var vol = GetMasterVolume();
                    if (vol != null) {
                        Guid g = Guid.Empty;
                        vol.SetMute(false, ref g);
                        Console.WriteLine("UNMUTED");
                        return 0;
                    }
                }
            } catch (Exception ex) {
                Console.WriteLine("ERROR: " + ex.Message);
                return 2;
            }

            Console.WriteLine("ERROR: Unknown command: " + cmd);
            return 1;
        }
    }
}

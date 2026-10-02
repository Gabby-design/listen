using System;
using System.Runtime.InteropServices;

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
        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
        private const byte VK_MEDIA_PLAY_PAUSE = 0xB3;
        private const uint KEYEVENTF_KEYUP = 0x0002;

        static void SendMediaPlayPause() {
            try {
                keybd_event(VK_MEDIA_PLAY_PAUSE, 0, 0, UIntPtr.Zero);
                keybd_event(VK_MEDIA_PLAY_PAUSE, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            } catch {}
        }

        static IAudioEndpointVolume GetMasterVolume() {
            var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
            IMMDevice dev;
            // 0 = eRender, 1 = eMultimedia
            int hr = enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
            if (hr != 0 || dev == null) return null;
            var iid = typeof(IAudioEndpointVolume).GUID;
            object o;
            dev.Activate(ref iid, 23, IntPtr.Zero, out o);
            return (IAudioEndpointVolume)o;
        }

        static int Main(string[] args) {
            if (args.Length == 0) {
                Console.WriteLine("Usage: audiocontrol.exe [mute | unmute | is-muted | pause-media | start-listening | stop-listening]");
                return 1;
            }

            string cmd = args[0].ToLower();

            try {
                var vol = GetMasterVolume();

                if (cmd == "mute") {
                    if (vol != null) {
                        Guid g = Guid.Empty;
                        vol.SetMute(true, ref g);
                        Console.WriteLine("MUTED");
                        return 0;
                    }
                } else if (cmd == "unmute") {
                    if (vol != null) {
                        Guid g = Guid.Empty;
                        vol.SetMute(false, ref g);
                        Console.WriteLine("UNMUTED");
                        return 0;
                    }
                } else if (cmd == "is-muted") {
                    if (vol != null) {
                        bool m;
                        vol.GetMute(out m);
                        Console.WriteLine(m ? "TRUE" : "FALSE");
                        return 0;
                    }
                } else if (cmd == "pause-media") {
                    SendMediaPlayPause();
                    Console.WriteLine("MEDIA_PAUSED");
                    return 0;
                } else if (cmd == "start-listening") {
                    // Mute audio output and trigger media pause
                    bool wasMuted = false;
                    if (vol != null) {
                        vol.GetMute(out wasMuted);
                        Guid g = Guid.Empty;
                        vol.SetMute(true, ref g);
                    }
                    SendMediaPlayPause();
                    Console.WriteLine(wasMuted ? "WAS_MUTED" : "WAS_UNMUTED");
                    return 0;
                } else if (cmd == "stop-listening") {
                    // Restore audio mute status
                    if (vol != null) {
                        Guid g = Guid.Empty;
                        vol.SetMute(false, ref g);
                    }
                    Console.WriteLine("RESTORED");
                    return 0;
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

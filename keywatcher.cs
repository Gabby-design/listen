using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace ListenKeyWatcher
{
    class Program
    {
        [DllImport("user32.dll")]
        public static extern short GetAsyncKeyState(int vKey);

        static int Main(string[] args)
        {
            if (args.Length == 0)
            {
                Console.WriteLine("Usage: keywatcher.exe wait-release [vk1] [vk2] ... OR is-down [vk]");
                return 1;
            }

            string command = args[0].ToLower();

            if (command == "wait-release")
            {
                List<int> vks = new List<int>();
                for (int i = 1; i < args.Length; i++)
                {
                    string arg = args[i].Trim();
                    if (arg.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
                    {
                        vks.Add(Convert.ToInt32(arg.Substring(2), 16));
                    }
                    else
                    {
                        int val;
                        if (int.TryParse(arg, out val)) vks.Add(val);
                    }
                }

                if (vks.Count == 0) return 0;

                // Brief initial pause to ensure keys are registered in held state
                Thread.Sleep(40);

                // Wait until any key in the combination is released
                while (true)
                {
                    bool allStillDown = true;
                    foreach (int vk in vks)
                    {
                        short state = GetAsyncKeyState(vk);
                        // Highest bit indicates key is currently pressed
                        if ((state & 0x8000) == 0)
                        {
                            allStillDown = false;
                            break;
                        }
                    }

                    if (!allStillDown)
                    {
                        break;
                    }

                    Thread.Sleep(20);
                }

                return 0;
            }

            return 0;
        }
    }
}

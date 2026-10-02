using System;
using System.IO;
using System.Text;
using System.Speech.Recognition;

namespace ListenOfflineSTT {
    class Program {
        static int Main(string[] args) {
            if (args.Length == 0) {
                Console.WriteLine("Usage: offlinetranscriber.exe [test | transcribe <wavFilePath>]");
                return 1;
            }

            string cmd = args[0].ToLower();

            if (cmd == "test") {
                try {
                    var recognizers = SpeechRecognitionEngine.InstalledRecognizers();
                    if (recognizers.Count == 0) {
                        Console.WriteLine("ERROR: No speech recognizers installed on this Windows system.");
                        return 2;
                    }
                    var defaultRec = recognizers[0];
                    using (var engine = new SpeechRecognitionEngine(defaultRec)) {
                        engine.LoadGrammar(new DictationGrammar());
                    }
                    Console.WriteLine("OK: " + defaultRec.Description);
                    return 0;
                } catch (Exception ex) {
                    Console.WriteLine("ERROR: " + ex.Message);
                    return 3;
                }
            }

            if (cmd == "transcribe") {
                if (args.Length < 2) {
                    Console.WriteLine("ERROR: Missing wav file path argument.");
                    return 1;
                }

                string wavPath = args[1];
                if (!File.Exists(wavPath)) {
                    Console.WriteLine("ERROR: WAV file does not exist: " + wavPath);
                    return 4;
                }

                try {
                    // Try to find English recognizer first, or fallback to first installed
                    RecognizerInfo targetRec = null;
                    foreach (var rec in SpeechRecognitionEngine.InstalledRecognizers()) {
                        if (rec.Culture.TwoLetterISOLanguageName.Equals("en", StringComparison.OrdinalIgnoreCase)) {
                            targetRec = rec;
                            break;
                        }
                    }
                    if (targetRec == null) {
                        var all = SpeechRecognitionEngine.InstalledRecognizers();
                        if (all.Count > 0) targetRec = all[0];
                    }

                    if (targetRec == null) {
                        Console.WriteLine("ERROR: No compatible speech recognizer found.");
                        return 5;
                    }

                    using (var engine = new SpeechRecognitionEngine(targetRec)) {
                        var dictGrammar = new DictationGrammar();
                        dictGrammar.Name = "ListenDictationGrammar";
                        engine.LoadGrammar(dictGrammar);

                        // Use FileStream with shared read
                        using (var fs = new FileStream(wavPath, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                            engine.SetInputToWaveStream(fs);
                            StringBuilder sb = new StringBuilder();

                            // Recognize all utterances in the file
                            while (true) {
                                RecognitionResult res = null;
                                try {
                                    res = engine.Recognize(TimeSpan.FromSeconds(10));
                                } catch {
                                    break;
                                }

                                if (res == null) break;

                                string phrase = res.Text;
                                if (!string.IsNullOrEmpty(phrase)) {
                                    if (sb.Length > 0) sb.Append(" ");
                                    sb.Append(phrase.Trim());
                                }
                            }

                            string finalResult = sb.ToString().Trim();
                            Console.WriteLine(finalResult);
                            return 0;
                        }
                    }
                } catch (Exception ex) {
                    Console.WriteLine("ERROR: " + ex.Message);
                    return 6;
                }
            }

            Console.WriteLine("ERROR: Unknown command: " + cmd);
            return 1;
        }
    }
}

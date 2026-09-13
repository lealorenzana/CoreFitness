// Core Fitness Admin -- the .exe behind the desktop icon.
//
// This replaces launch.vbs for people who want a real program to double-click
// rather than a shortcut that points at wscript.exe. It does the same job and
// no more: find Node, find serve.mjs, start it with no console window, get out
// of the way. Everything the dashboard actually does still lives in serve.mjs.
//
// Why C# and not Electron/Tauri/pkg: csc.exe ships inside Windows itself
// (C:\Windows\Microsoft.NET\Framework64\v4.0.30319), so this compiles on the
// gym's laptop with nothing installed, produces one 82 KB file (74 KB of which
// is the embedded icon), and needs no
// npm package that could rot. Built by build-exe.ps1.
//
// It is a WinExe, so Windows gives it no console -- that is the whole reason a
// shortcut to node.exe was unacceptable: node is a console program and parks a
// black terminal on the taskbar for as long as the dashboard is open.

using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class CoreFitnessAdmin
{
    private const string Title = "Core Fitness Admin";

    [STAThread]
    private static int Main(string[] args)
    {
        string server = FindServer();
        if (server == null)
        {
            Fail("Cannot find serve.mjs.\n\n" +
                 "This launcher expects to sit in g-fitness-admin\\desktop, or to have been\n" +
                 "built by build-exe.ps1 so it remembers where that folder is.\n\n" +
                 "Looked beside: " + ExeDir() + "\n" +
                 "and at: " + (Installed.ServerPath.Length == 0 ? "(nothing recorded)" : Installed.ServerPath));
            return 1;
        }

        string node = FindNode();
        if (node == null)
        {
            Fail("Node.js is not installed on this computer.\n\n" +
                 "The dashboard is served by Node, so the icon cannot open without it.\n" +
                 "Install the LTS build from https://nodejs.org and try again.");
            return 1;
        }

        // serve.mjs serves ../dist. An unbuilt checkout would otherwise open a
        // window onto nothing, so offer the build here, where there is a dialog
        // to offer it in -- a double-clicked icon has nowhere to print advice.
        string dist = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(server), "..", "dist"));
        if (!File.Exists(Path.Combine(dist, "index.html")))
        {
            DialogResult go = MessageBox.Show(
                "The admin dashboard has not been built yet.\n\n" +
                "Build it now? This takes about a minute and only has to happen\n" +
                "again after the code changes.",
                Title, MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (go != DialogResult.Yes) return 1;
            if (!RunBuild(Path.GetFullPath(Path.Combine(dist, "..")))) return 1;
        }

        try
        {
            ProcessStartInfo psi = new ProcessStartInfo(node, Quote(server));
            psi.WorkingDirectory = Path.GetDirectoryName(server);
            psi.UseShellExecute = false;   // required for CreateNoWindow to apply
            psi.CreateNoWindow = true;     // no black terminal beside the dashboard
            Process.Start(psi);
        }
        catch (Exception ex)
        {
            Fail("Could not start the dashboard.\n\n" + ex.Message);
            return 1;
        }
        return 0;
    }

    /// <summary>Where this .exe lives. Not the working directory: Explorer sets that elsewhere.</summary>
    private static string ExeDir()
    {
        return Path.GetDirectoryName(Application.ExecutablePath);
    }

    /// <summary>
    /// serve.mjs, in the order that keeps a copied .exe working: beside it, in a
    /// desktop\ folder under it, one level up -- then the absolute path recorded
    /// at build time, which is what makes a copy on the Desktop work at all.
    /// </summary>
    private static string FindServer()
    {
        string here = ExeDir();
        string[] candidates =
        {
            Path.Combine(here, "serve.mjs"),
            Path.Combine(here, "desktop", "serve.mjs"),
            Path.Combine(here, "..", "desktop", "serve.mjs"),
            Path.Combine(here, "g-fitness-admin", "desktop", "serve.mjs"),
            Installed.ServerPath,
        };
        foreach (string c in candidates)
        {
            if (c.Length == 0) continue;
            try { if (File.Exists(c)) return Path.GetFullPath(c); }
            catch (ArgumentException) { }  // a malformed candidate is just a miss
        }
        return null;
    }

    /// <summary>
    /// node.exe. PATH is checked last on purpose: a process launched from
    /// Explorer does not always inherit the PATH a terminal has, which is the
    /// same reason launch.vbs prefers the known install directory.
    /// </summary>
    private static string FindNode()
    {
        string[] fixedPaths =
        {
            Path.Combine(Environment.GetEnvironmentVariable("ProgramFiles") ?? @"C:\Program Files", @"nodejs\node.exe"),
            Path.Combine(Environment.GetEnvironmentVariable("ProgramFiles(x86)") ?? @"C:\Program Files (x86)", @"nodejs\node.exe"),
            Path.Combine(Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? "", @"Programs\nodejs\node.exe"),
        };
        foreach (string p in fixedPaths)
        {
            if (p.Length > 0 && File.Exists(p)) return p;
        }

        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string dir in path.Split(';'))
        {
            if (dir.Trim().Length == 0) continue;
            try
            {
                string candidate = Path.Combine(dir.Trim(), "node.exe");
                if (File.Exists(candidate)) return candidate;
            }
            catch (ArgumentException) { }  // PATH entries are not always legal paths
        }
        return null;
    }

    /// <summary>
    /// Runs `npm run build` in a visible window and waits. Visible on purpose:
    /// it takes a minute, and a silent minute reads as a broken icon.
    /// </summary>
    private static bool RunBuild(string appDir)
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c npm run build");
            psi.WorkingDirectory = appDir;
            psi.UseShellExecute = false;
            Process build = Process.Start(psi);
            build.WaitForExit();
            if (build.ExitCode != 0)
            {
                Fail("The build failed (exit code " + build.ExitCode + ").\n\n" +
                     "Run `npm install` then `npm run build` in\n" + appDir +
                     "\nto see what it is complaining about.");
                return false;
            }
            return true;
        }
        catch (Exception ex)
        {
            Fail("Could not run the build.\n\n" + ex.Message);
            return false;
        }
    }

    private static string Quote(string s)
    {
        return "\"" + s + "\"";
    }

    private static void Fail(string message)
    {
        MessageBox.Show(message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}

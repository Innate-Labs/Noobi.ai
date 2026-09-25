import AppKit
import ApplicationServices
if CommandLine.arguments.count == 1 { print(AXIsProcessTrusted() ? "trusted" : "not-trusted"); exit(0) }
guard AXIsProcessTrusted(), CommandLine.arguments.count == 4, let pid = Int32(CommandLine.arguments[1]), let key = UInt16(CommandLine.arguments[2]), let milliseconds = UInt32(CommandLine.arguments[3]), milliseconds <= 5000 else { exit(2) }
guard let application = NSRunningApplication(processIdentifier: pid) else { exit(3) }
application.activate(options: [.activateIgnoringOtherApps])
usleep(100000)
CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: true)?.postToPid(pid)
usleep(milliseconds * 1000)
CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: false)?.postToPid(pid)

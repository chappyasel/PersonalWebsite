/**
 * End a script's process when its `main()` is done, whatever is still open.
 *
 * Chrome for Testing on macOS starts `chrome_crashpad_handler` helpers that
 * outlive the browser and keep the write end of its stderr pipe. Node never
 * sees that pipe close, so a script that only sets `process.exitCode` stays
 * alive after its work is over. Two approval holders sat like that for two
 * days after logging `host_finished` (2026-10-05 to 10-07).
 */
export function exitWhenDone(
  main: () => Promise<number>,
  onCrash: (error: unknown) => Promise<void> | void = () => undefined,
): Promise<void> {
  return main()
    .catch(async (error: unknown) => {
      await Promise.resolve(onCrash(error)).catch(() => undefined);
      return 2;
    })
    .then(async (code) => {
      process.exitCode = code;
      // `process.exit` drops queued output, and a pipe on macOS is written
      // asynchronously, so wait for the last JSON line to leave first.
      await Promise.all([flushed(process.stdout), flushed(process.stderr)]);
      process.exit(code);
    });
}

function flushed(stream: NodeJS.WriteStream): Promise<void> {
  return new Promise((resolve) => {
    if (!stream.writable) {
      resolve();
      return;
    }
    // A write's callback runs after every write queued before it.
    stream.write("", () => resolve());
    setTimeout(resolve, 2000).unref();
  });
}

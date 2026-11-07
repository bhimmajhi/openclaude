# Termux Quick Launch

This guide is for the OpenClaude repository on Android using Termux and the Ubuntu environment from [`ANDROID_INSTALL.md`](ANDROID_INSTALL.md). The initial install/build and provider setup are one-time steps; after that, launch the agent from Termux with **one command**:

```bash
proot-distro login ubuntu -- bash -lc 'cd /data/data/com.termux/files/home/openclaude && exec node dist/cli.mjs'
```

This assumes the repository is at `/data/data/com.termux/files/home/openclaude`, as in the Android install guide, and that Node.js and the OpenRouter environment variables are available in the Ubuntu shell. If you cloned it somewhere else, replace that directory with the actual repo path.

To avoid typing the command each time, create a short alias in Termux:

```bash
echo "alias openclaude='proot-distro login ubuntu -- bash -lc \"cd /data/data/com.termux/files/home/openclaude && exec node dist/cli.mjs\"'" >> ~/.bashrc
source ~/.bashrc
```

Then start the agent with:

```bash
openclaude
```

The API key should remain configured in Ubuntu's `~/.bashrc` as described in [`ANDROID_INSTALL.md`](ANDROID_INSTALL.md); don't put a real API key into the alias or commit it to the repository.

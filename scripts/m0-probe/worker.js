self.onmessage = (e) => self.postMessage({ echo: e.data, from: "sibling-worker" });

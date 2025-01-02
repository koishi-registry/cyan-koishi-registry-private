self.onmessage = (evt) => {
  console.log("CHILD: received message from parent", evt.data);
};

await import('@p/rt')

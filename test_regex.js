try {
  console.log(new RegExp('^(?:0|\\+84)(?:3|5|7|8|9)[\\d .\\(\\)\\-]{8,14}$', 'v'));
} catch (e) {
  console.error(e.message);
}

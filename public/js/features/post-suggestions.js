export function init(form) {
  const input = form.querySelector('#post-search');
  const selectedPost = form.querySelector('[data-selected-post]');
  const list = form.querySelector('[role="listbox"]');
  if (!input || !selectedPost || !list) {return;}

  let timer;
  let activeIndex = -1;
  let suggestions = [];
  let request;

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
  }

  function activate(index) {
    const options = [...list.querySelectorAll('[role="option"]')];
    if (!options.length) {return;}
    activeIndex = (index + options.length) % options.length;
    options.forEach((option, optionIndex) => {
      option.setAttribute('aria-selected', String(optionIndex === activeIndex));
    });
    options[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  function choose(post) {
    input.value = post.title;
    selectedPost.value = post.id;
    close();
    form.requestSubmit();
  }

  function render(posts) {
    suggestions = posts.slice(0, 8);
    list.replaceChildren();
    for (const post of suggestions) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'btn btn--secondary post-suggestion';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = post.title;
      option.addEventListener('click', () => choose(post));
      list.append(option);
    }
    list.hidden = suggestions.length === 0;
    input.setAttribute('aria-expanded', String(suggestions.length > 0));
  }

  input.addEventListener('input', () => {
    selectedPost.value = '';
    clearTimeout(timer);
    request?.abort();
    const query = input.value.trim();
    if (query.length < 2) {close(); return;}
    timer = setTimeout(async () => {
      request = new AbortController();
      try {
        const response = await fetch(`/api/admin/posts/suggest?q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' }, signal: request.signal });
        if (!response.ok) {close(); return;}
        render(await response.json());
      } catch (error) { if (error.name !== 'AbortError') {close();} }
    }, 250);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {close(); return;}
    if (list.hidden || !suggestions.length) {return;}
    if (event.key === 'ArrowDown') {event.preventDefault(); activate(activeIndex + 1);}
    else if (event.key === 'ArrowUp') {event.preventDefault(); activate(activeIndex < 0 ? suggestions.length - 1 : activeIndex - 1);}
    else if (event.key === 'Enter' && activeIndex >= 0) {event.preventDefault(); choose(suggestions[activeIndex]);}
  });

  document.addEventListener('click', (event) => {if (!form.contains(event.target)) {close();}});
  input.addEventListener('blur', () => {setTimeout(() => {if (!form.contains(document.activeElement)) {close();}}, 0);});
}

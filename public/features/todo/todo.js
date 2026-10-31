let todoItems = [];
// ===== 待辦清單 =====
function addTodo() {
    const input = document.getElementById('todo-input');
    const text = input.value.trim();
    if (text) {
        todoItems.push({ text, completed: false });
        input.value = '';
        renderTodos();
        saveData();
    }
}

function toggleTodo(index) {
    todoItems[index].completed = !todoItems[index].completed;
    renderTodos();
    saveData();
}

function deleteTodo(index) {
    todoItems.splice(index, 1);
    renderTodos();
    saveData();
}

function renderTodos() {
    const list = document.getElementById('todo-list');
    list.innerHTML = todoItems.map((item, i) => `
        <div class="todo-item ${item.completed ? 'completed' : ''}">
            <input type="checkbox" class="todo-checkbox" ${item.completed ? 'checked' : ''} onchange="toggleTodo(${i})">
            <span class="todo-text">${item.text}</span>
            <button class="todo-delete" onclick="deleteTodo(${i})">×</button>
        </div>
    `).join('');
}

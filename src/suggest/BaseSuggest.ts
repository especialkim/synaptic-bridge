export interface BaseSuggestProps {
    inputEl: HTMLInputElement;
    plugin: any;
}

export abstract class BaseSuggest<T> {
    protected suggestEl: HTMLElement;
    protected selectedIndex = -1;

    constructor(protected props: BaseSuggestProps) {
        // 1. Create wrapper if not exists
        const inputEl = this.props.inputEl;
        let wrapper = inputEl.closest('.input-suggest-wrapper') as HTMLElement | null;
        if (!wrapper) {
            wrapper = createDiv('input-suggest-wrapper');
            inputEl.parentNode?.insertBefore(wrapper, inputEl);
            wrapper.appendChild(inputEl);
        }
        // 2. Create suggestEl and append to wrapper
        this.suggestEl = createDiv('suggestion-container');
        this.suggestEl.addClass('hidden');
        wrapper.appendChild(this.suggestEl);
        this.initializeEventListeners();
    }

    protected initializeEventListeners(): void {
        const { inputEl } = this.props;
        
        inputEl.addEventListener('input', this.onInputChanged.bind(this));
        inputEl.addEventListener('focus', () => this.onInputChanged());
        inputEl.addEventListener('blur', () => {
            setTimeout(() => {
                this.suggestEl.addClass('hidden');
            }, 100);
        });
        inputEl.addEventListener('keydown', this.handleKeyDown.bind(this));

        // 마우스가 suggestion list 전체를 벗어나면 키보드 선택 상태로 복귀
        this.suggestEl.addEventListener('mouseleave', () => {
            const suggestions = this.suggestEl.querySelectorAll('.suggestion-item');
            suggestions.forEach(item => item.removeClass('is-selected'));
            if (this.selectedIndex >= 0 && this.selectedIndex < suggestions.length) {
                suggestions[this.selectedIndex].addClass('is-selected');
            }
        });
    }

    // 공통 키보드 이벤트 처리
    protected handleKeyDown(event: KeyboardEvent): void {
        switch (event.key) {
            case 'ArrowUp':
                event.preventDefault();
                this.moveSelection('up');
                break;
            case 'ArrowDown':
                event.preventDefault();
                this.moveSelection('down');
                break;
            case 'Enter':
                event.preventDefault();
                this.selectCurrentSuggestion();
                this.suggestEl.addClass('hidden');
                break;
            case 'Escape':
                event.preventDefault();
                this.suggestEl.addClass('hidden');
                this.selectedIndex = -1;
                break;
        }
    }

    // 공통 선택 이동 로직
    protected moveSelection(direction: 'up' | 'down'): void {
        const suggestions = this.suggestEl.querySelectorAll('.suggestion-item');
        if (!suggestions.length) return;

        // 항상 모든 is-selected 제거
        suggestions.forEach(item => item.removeClass('is-selected'));

        if (direction === 'up') {
            this.selectedIndex = this.selectedIndex <= 0 ? suggestions.length - 1 : this.selectedIndex - 1;
        } else {
            this.selectedIndex = this.selectedIndex >= suggestions.length - 1 ? 0 : this.selectedIndex + 1;
        }

        const selectedEl = suggestions[this.selectedIndex];
        selectedEl.addClass('is-selected');
        selectedEl.scrollIntoView({ block: 'nearest' });
    }

    // 추상 메서드들
    protected abstract getItems(): T[];
    protected abstract calculateScore(item: T, inputStr: string): number;
    protected abstract getDisplayText(item: T): string;
    
    // 공통 입력 변경 처리
    protected onInputChanged(): void {
        const inputStr = this.props.inputEl.value.toLowerCase();
        if (!inputStr) {
            this.suggestEl.addClass('hidden');
            return;
        }

        const items = this.getItems();
        const matches = this.findMatches(items, inputStr);
        this.updateSuggestions(matches);
    }

    protected findMatches(items: T[], inputStr: string): T[] {
        return items
            .map(item => ({
                item,
                score: this.calculateScore(item, inputStr)
            }))
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score)
            .map(({ item }) => item);
    }

    protected selectCurrentSuggestion(): void {
        const suggestions = this.suggestEl.querySelectorAll('.suggestion-item');
        if (this.selectedIndex >= 0 && this.selectedIndex < suggestions.length) {
            const selectedValue = suggestions[this.selectedIndex].textContent;
            if (selectedValue) {
                this.props.inputEl.value = selectedValue;
                this.suggestEl.addClass('hidden');
                this.selectedIndex = -1;
                const evt = new Event('input', { bubbles: true });
                this.props.inputEl.dispatchEvent(evt);
            }
        }
    }

    protected updateSuggestions(matches: T[]): void {
        this.suggestEl.empty();
        
        if (matches.length > 0) {
            matches.forEach((match, index) => {
                const suggestionEl = this.suggestEl.createEl('div', {
                    text: this.getDisplayText(match),
                    cls: 'suggestion-item',
                });
                
                // 키보드 선택 상태만 반영 (마우스는 이벤트에서 처리)
                if (index === this.selectedIndex) {
                    suggestionEl.addClass('is-selected');
                }
                
                suggestionEl.addEventListener('click', () => {
                    this.props.inputEl.value = this.getDisplayText(match);
                    this.suggestEl.addClass('hidden');
                    this.selectedIndex = -1;
                    const evt = new Event('input', { bubbles: true });
                    this.props.inputEl.dispatchEvent(evt);
                });

                // 마우스 호버 시 is-selected 적용 및 selectedIndex 갱신
                suggestionEl.addEventListener('mouseenter', () => {
                    const allItems = this.suggestEl.querySelectorAll('.suggestion-item');
                    allItems.forEach(item => item.removeClass('is-selected'));
                    suggestionEl.addClass('is-selected');
                    this.selectedIndex = index;
                });
            });
            this.suggestEl.removeClass('hidden');
        } else {
            this.suggestEl.addClass('hidden');
            this.selectedIndex = -1;
        }
    }

    protected calculateConsecutiveMatches(text: string, inputStr: string): number {
        const searchChars = inputStr.split('');
        let currentIndex = 0;
        let consecutiveMatches = 0;

        for (const char of searchChars) {
            if (char === ' ') {
                consecutiveMatches++;
                continue;
            }
            currentIndex = text.indexOf(char, currentIndex);
            if (currentIndex === -1) return 0;
            consecutiveMatches++;
            currentIndex += 1;
        }

        return consecutiveMatches;
    }
}
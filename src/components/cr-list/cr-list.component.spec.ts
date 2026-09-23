import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrListComponent } from './cr-list.component';
import { SessionService } from '../../session/session.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';
import { CrApiService } from '../../api/cr-api.service';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render(user: ReqUser): Promise<ComponentFixture<CrListComponent>> {
	TestBed.configureTestingModule({
		imports: [CrListComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrListComponent);
	fixture.detectChanges(); // ngOnInit -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded/empty state
	return fixture;
}

describe('CrListComponent', () => {
	it('renders a row per change request in the user org', async () => {
		const fixture = await render(users.approver);
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(3); // org-alpha: CR-1, CR-2, CR-3
	});

	it('shows the empty state when the org has no change requests', async () => {
		const fixture = await render({ id: 'x', orgCode: 'org-empty', policies: ['cr_r_o'] });
		expect(fixture.nativeElement.querySelector('.cr-list__empty')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();
	});

	it('filters rendered rows by status', async () => {
		const fixture = await render(users.approver);

		const select: HTMLSelectElement = fixture.nativeElement.querySelector('.cr-list__filter');
		select.value = 'PENDING_APPROVAL';
		select.dispatchEvent(new Event('change'));
		fixture.detectChanges();

		const rows: HTMLTableRowElement[] = Array.from(fixture.nativeElement.querySelectorAll('.cr-list__row'));
		expect(rows).toHaveLength(1);
		expect(rows[0].textContent).toContain('CR-1');
		expect(rows[0].textContent).toContain('PENDING_APPROVAL');
	});

	it('shows an error and reloads successfully after Retry', async () => {
		TestBed.configureTestingModule({
			imports: [CrListComponent],
			providers: [{ provide: SessionService, useValue: { user: users.approver } }],
		});
		await TestBed.compileComponents();
		TestBed.inject(CrApiService).failNext = true;
		const fixture = TestBed.createComponent(CrListComponent);

		fixture.detectChanges();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__error').textContent).toContain('Network error');

		const retryButton: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-list__error button');
		retryButton.click();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row')).toHaveLength(3);
	});
});

import { toCsv } from './csv';

describe('toCsv', () => {
  it('starts with a BOM, ends lines with CRLF and quotes a cell with a comma or quote', () => {
    expect(toCsv(['a'], [['x,"y"']])).toBe('\uFEFFa\r\n"x,""y"""\r\n');
  });

  it('quotes cells containing CR or LF and leaves plain cells alone', () => {
    expect(
      toCsv(
        ['a', 'b'],
        [
          ['line1\nline2', 'plain'],
          ['cr\rhere', ''],
        ],
      ),
    ).toBe('\uFEFFa,b\r\n"line1\nline2",plain\r\n"cr\rhere",\r\n');
  });

  it('keeps Bangla text as it is', () => {
    expect(toCsv(['নাম'], [['শাড়ি ৳১,২৫০']])).toBe('\uFEFFনাম\r\n"শাড়ি ৳১,২৫০"\r\n');
    expect(toCsv(['নাম'], [['জামদানি শাড়ি']])).toBe('\uFEFFনাম\r\nজামদানি শাড়ি\r\n');
  });

  it.each([
    ['=HYPERLINK("http://x")', `"'=HYPERLINK(""http://x"")"`],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tcmd', "'\tcmd"],
    ['\rcmd', `"'\rcmd"`],
    ['+cmd|x', "'+cmd|x"],
    ['-cmd', "'-cmd"],
    ['-', "'-"],
    ["-2+3+cmd|' /C calc'!A0", "'-2+3+cmd|' /C calc'!A0"],
    ['+1+HYPERLINK("x")', `"'+1+HYPERLINK(""x"")"`],
  ])('prefixes a quote so Excel does not run %j as a formula', (value, written) => {
    expect(toCsv(['a'], [[value]])).toBe(`\uFEFFa\r\n${written}\r\n`);
  });

  it.each([['+8801712345678'], ['-50'], ['-1.5'], ['+880 1712-345678'], ['+৮৮০১৭'], ['01712345678'], ['a=b'], ['Rina @ Dhaka']])(
    'leaves %j as it is',
    (value) => {
      expect(toCsv(['a'], [[value]])).toBe(`\uFEFFa\r\n${value}\r\n`);
    },
  );

  it('escapes a formula in the header too (headers come from the seller file)', () => {
    expect(toCsv(['=1+1'], [])).toBe("\uFEFF'=1+1\r\n");
  });

  it('writes only the header when there are no rows', () => {
    expect(toCsv(['Row', 'Status'], [])).toBe('\uFEFFRow,Status\r\n');
  });
});

export function Logo() {
  return (
    <div className="fixed top-4 z-50 flex items-center" style={{ left: '20px' }} data-testid="logo">
      <img 
        src="./Frame%2013.svg" 
        alt="ZenOS Logo Dark" 
        className="h-8 w-auto hidden dark:block"
      />
      <img 
        src="./Frame%2014.svg" 
        alt="ZenOS Logo Light" 
        className="h-8 w-auto block dark:hidden"
      />
    </div>
  );
}

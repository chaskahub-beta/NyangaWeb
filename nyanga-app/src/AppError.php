<?php
declare(strict_types=1);

/** Error con un código que el sitio sabe traducir (se devuelve como JSON). */
final class AppError extends RuntimeException
{
    public string $errorCode;
    public int $status;
    /** @var array<string,mixed> */
    public array $extra;

    public function __construct(string $code, int $status = 400, array $extra = [])
    {
        parent::__construct($code);
        $this->errorCode = $code;
        $this->status = $status;
        $this->extra = $extra;
    }
}
